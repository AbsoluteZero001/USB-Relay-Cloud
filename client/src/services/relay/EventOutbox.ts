import {createRelayEvent} from "@/api/eventApi";
import {ApiError} from "@/api/http";
import type {RelayEventCreatePayload} from "@/types/api";

/**
 * Phase 8：本地待同步事件队列。
 *
 * 流程：
 * 1. USB 写入（SUCCESS 或 FAILED）后，将事件入队（持久化到 localStorage）
 * 2. 立即触发 flush()：POST 到云端
 * 3. POST 200 → 出队；失败 → 保留在队列
 * 4. 重连 / 启动时再次 flush() 重试未同步事件
 *
 * 幂等：服务端 relay_event.event_id UNIQUE 保证重复 POST 不会插入新行。
 * 入队时按 eventId 去重，避免同一事件被多次入队。
 *
 * 注意：FAILED 事件同样入队，便于在操作日志中记录失败尝试；
 * 服务端不会因 FAILED 更新 relay_state（spec §19）。
 */
export interface QueuedRelayEvent {
    deviceId: string;
    payload: RelayEventCreatePayload;
    queuedAt: number;
}

export interface OutboxFlushSummary {
    success: number;
    failed: number;
    remaining: number;
    /** 被服务端永久拒绝（4xx）后丢弃的条目数 */
    dropped: number;
}

export type OutboxStorage = {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
};

const STORAGE_KEY = "usb-relay-cloud-event-outbox";
const MAX_QUEUE_SIZE = 200;

export class EventOutbox {
    private readonly storage: OutboxStorage;
    private readonly storageKey: string;
    private readonly maxQueueSize: number;
    private flushing = false;

    constructor(
        storage: OutboxStorage = typeof localStorage !== "undefined"
            ? localStorage
            : memoryStorage(),
        storageKey: string = STORAGE_KEY,
        maxQueueSize: number = MAX_QUEUE_SIZE,
    ) {
        this.storage = storage;
        this.storageKey = storageKey;
        this.maxQueueSize = maxQueueSize;
    }

    /**
     * 入队一个待同步事件。eventId 重复时跳过。
     * 队列超过上限时丢弃最旧的条目，避免无限增长。
     */
    enqueue(deviceId: string, payload: RelayEventCreatePayload): void {
        const items = this.load();
        if (items.some((it) => it.payload.eventId === payload.eventId)) {
            return;
        }
        items.push({
            deviceId,
            payload,
            queuedAt: Date.now(),
        });
        while (items.length > this.maxQueueSize) {
            items.shift();
        }
        this.save(items);
    }

    /**
     * 尝试同步队列中的全部事件。POST 成功的出队，失败的保留。
     * 幂等：服务端会按 eventId 去重，重复 POST 不会产生新事件。
     *
     * @returns 同步摘要：成功数 / 失败数 / 队列剩余
     */
    async flush(): Promise<OutboxFlushSummary> {
        if (this.flushing) {
            return this.summary(0, 0);
        }
        this.flushing = true;
        try {
            const items = this.load();
            if (items.length === 0) {
                return this.summary(0, 0);
            }
            let success = 0;
            let failed = 0;
            let dropped = 0;
            const remaining: QueuedRelayEvent[] = [];
            for (const item of items) {
                try {
                    await createRelayEvent(item.deviceId, item.payload);
                    success++;
                } catch (error) {
                    if (isPermanentlyRejected(error)) {
                        // 服务端返回 4xx：重试多少次都不会成功（例如旧版本
                        // 写入的非法 FAILED 事件），丢弃避免队列永久卡住。
                        dropped++;
                        continue;
                    }
                    remaining.push(item);
                    failed++;
                }
            }
            this.save(remaining);
            return this.summary(success, failed, remaining.length, dropped);
        } finally {
            this.flushing = false;
        }
    }

    size(): number {
        return this.load().length;
    }

    /**
     * 删除指定 eventId 的事件。用于立即 POST 成功后单独出队。
     * 不存在时静默返回。
     */
    remove(eventId: string): void {
        const items = this.load();
        const next = items.filter((it) => it.payload.eventId !== eventId);
        if (next.length !== items.length) {
            this.save(next);
        }
    }

    /**
     * 清空队列。仅用于测试或用户手动重置。
     */
    clear(): void {
        this.save([]);
    }

    /**
     * 返回队列快照（用于调试/UI 显示）。调用方不应修改返回的数组。
     */
    peek(): QueuedRelayEvent[] {
        return this.load();
    }

    private load(): QueuedRelayEvent[] {
        try {
            const raw = this.storage.getItem(this.storageKey);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.filter(isQueuedRelayEvent);
        } catch {
            return [];
        }
    }

    private save(items: QueuedRelayEvent[]): void {
        try {
            this.storage.setItem(this.storageKey, JSON.stringify(items));
        } catch {
            // localStorage 满或不可用时，丢弃最旧条目重试一次
            try {
                const trimmed = items.slice(-Math.floor(this.maxQueueSize / 2));
                this.storage.setItem(this.storageKey, JSON.stringify(trimmed));
            } catch {
                // 仍失败则放弃持久化，本次入队数据丢失但不会阻塞调用方
            }
        }
    }

    private summary(
        success: number,
        failed: number,
        remaining?: number,
        dropped = 0,
    ): OutboxFlushSummary {
        return {
            success,
            failed,
            remaining: remaining ?? this.size(),
            dropped,
        };
    }
}

/**
 * 服务端 4xx 表示请求本身不合法（不可重试）；
 * 401/403/408/429 除外：它们可能通过重新登录或稍后重试恢复。
 */
function isPermanentlyRejected(error: unknown): boolean {
    if (!(error instanceof ApiError) || error.status === null) {
        return false;
    }
    if (error.status < 400 || error.status >= 500) {
        return false;
    }
    return ![401, 403, 408, 429].includes(error.status);
}

function isQueuedRelayEvent(value: unknown): value is QueuedRelayEvent {
    if (!value || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    return typeof v.deviceId === "string"
        && v.payload !== null
        && typeof v.payload === "object"
        && typeof (v.payload as Record<string, unknown>).eventId === "string"
        && typeof v.queuedAt === "number";
}

/**
 * SSR / 测试 / 受限环境下 localStorage 不可用时的内存兜底。
 */
function memoryStorage(): OutboxStorage {
    const map = new Map<string, string>();
    return {
        getItem: (key) => (map.has(key) ? map.get(key) ?? null : null),
        setItem: (key, value) => void map.set(key, value),
        removeItem: (key) => void map.delete(key),
    };
}
