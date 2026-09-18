import {beforeEach, describe, expect, it, vi} from "vitest";

import {EventOutbox, type OutboxStorage} from "./EventOutbox";
import type {RelayEventCreatePayload} from "@/types/api";

// Mock createRelayEvent so tests don't touch the network.
vi.mock("@/api/eventApi", () => ({
    createRelayEvent: vi.fn(),
    fetchRelayEvents: vi.fn(),
}));

import {createRelayEvent} from "@/api/eventApi";

function makePayload(eventId: string): RelayEventCreatePayload {
    return {
        eventId,
        channel: 1,
        action: "ON",
        previousState: "OFF",
        currentState: "ON",
        commandStatus: "SUCCESS",
        source: "ANDROID",
        clientId: "test-client",
    };
}

function makeStoredEvent(eventId: string) {
    return {
        sequence: 1,
        eventId,
        deviceId: "relay-001",
        channel: 1,
        action: "ON" as const,
        previousState: "OFF" as const,
        currentState: "ON" as const,
        commandStatus: "SUCCESS" as const,
        source: "ANDROID" as const,
        clientId: "test-client",
        hardwareState: "UNKNOWN" as const,
        createdAt: "2026-09-18T10:00:00Z",
        idempotentReplay: false,
    };
}

function makeStorage(): OutboxStorage & { dump: () => string } {
    let store = "";
    return {
        getItem: (key: string) => (store.length > 0 ? store : null),
        setItem: (_key: string, value: string) => void (store = value),
        removeItem: () => void (store = ""),
        dump: () => store,
    };
}

describe("EventOutbox", () => {
    let storage: ReturnType<typeof makeStorage>;
    let outbox: EventOutbox;

    beforeEach(() => {
        storage = makeStorage();
        outbox = new EventOutbox(storage, "test-outbox", 10);
        vi.mocked(createRelayEvent).mockReset();
    });

    it("enqueues and flushes successfully", async () => {
        vi.mocked(createRelayEvent).mockResolvedValue(makeStoredEvent("e1"));

        outbox.enqueue("relay-001", makePayload("e1"));
        expect(outbox.size()).toBe(1);

        const summary = await outbox.flush();

        expect(summary.success).toBe(1);
        expect(summary.failed).toBe(0);
        expect(summary.remaining).toBe(0);
        expect(outbox.size()).toBe(0);
    });

    it("keeps failed uploads in the queue", async () => {
        vi.mocked(createRelayEvent).mockRejectedValue(new Error("network down"));

        outbox.enqueue("relay-001", makePayload("e1"));
        outbox.enqueue("relay-001", makePayload("e2"));
        expect(outbox.size()).toBe(2);

        const summary = await outbox.flush();

        expect(summary.success).toBe(0);
        expect(summary.failed).toBe(2);
        expect(summary.remaining).toBe(2);
        expect(outbox.size()).toBe(2);
    });

    it("does not enqueue duplicates by eventId", () => {
        outbox.enqueue("relay-001", makePayload("dup"));
        outbox.enqueue("relay-001", makePayload("dup"));
        expect(outbox.size()).toBe(1);
    });

    it("removes a specific eventId", () => {
        outbox.enqueue("relay-001", makePayload("a"));
        outbox.enqueue("relay-001", makePayload("b"));
        outbox.remove("a");
        expect(outbox.size()).toBe(1);
        expect(outbox.peek()[0]?.payload.eventId).toBe("b");
    });

    it("persists across storage instances", () => {
        outbox.enqueue("relay-001", makePayload("persisted"));
        const restored = new EventOutbox(storage, "test-outbox", 10);
        expect(restored.size()).toBe(1);
        expect(restored.peek()[0]?.payload.eventId).toBe("persisted");
    });

    it("flush is re-entrant safe", async () => {
        vi.mocked(createRelayEvent).mockImplementation(
            async () => {
                // Simulate slow upload to keep flushing=true during the second call.
                await new Promise((resolve) => setTimeout(resolve, 10));
                return makeStoredEvent("e1");
            },
        );
        outbox.enqueue("relay-001", makePayload("e1"));
        const [first, second] = await Promise.all([
            outbox.flush(),
            outbox.flush(),
        ]);
        // Second flush ran while first was in flight — should be a no-op summary.
        expect(first.success).toBe(1);
        expect(second.success).toBe(0);
        expect(outbox.size()).toBe(0);
    });

    it("ignores corrupted storage content", () => {
        storage.setItem("test-outbox", "not-json{");
        expect(outbox.size()).toBe(0);
        outbox.enqueue("relay-001", makePayload("after-corrupt"));
        expect(outbox.size()).toBe(1);
    });
});
