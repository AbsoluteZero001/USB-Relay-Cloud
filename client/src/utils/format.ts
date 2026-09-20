import type {
    CommandStatus,
    EventSource,
    HardwareEventType,
    OnlineStatus,
    RelayAction,
    RelayStateValue,
    WebSocketStatus,
} from "@/types/api";

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "--:--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatRelativeTime(
  value: string | null | undefined,
): string {
  if (!value) return "尚未上线";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("zh-CN", {
    numeric: "auto",
  });
  if (Math.abs(seconds) < 60) {
    return formatter.format(seconds, "second");
  }
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) {
    return formatter.format(minutes, "minute");
  }
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) {
    return formatter.format(hours, "hour");
  }
  return formatDateTime(value);
}

export function sourceLabel(source: EventSource): string {
  const labels: Record<EventSource, string> = {
    ANDROID: "Android",
    WEB: "Web",
    ELECTRON: "Electron",
    SYSTEM: "系统",
  };
  return labels[source];
}

export function stateLabel(state: RelayStateValue): string {
    const labels: Record<RelayStateValue, string> = {
        ON: "开启",
        OFF: "关闭",
        UNKNOWN: "未知",
    };
    return labels[state];
}

export function actionLabel(action: RelayAction): string {
    return action === "ON" ? "开启" : "关闭";
}

export function onlineLabel(status: OnlineStatus): string {
    return status === "ONLINE" ? "在线" : "离线";
}

export function commandStatusLabel(status: CommandStatus): string {
    return status === "SUCCESS" ? "成功" : "失败";
}

/**
 * 硬件生命周期事件的中文标签。
 * 不依赖颜色作为唯一信息表达。
 */
export function hardwareEventTypeLabel(type: HardwareEventType): string {
    const labels: Record<HardwareEventType, string> = {
        USB_ATTACHED: "USB 设备插入",
        USB_CONNECTED: "继电器连接成功",
        USB_DISCONNECTED: "USB 连接断开",
        USB_DETACHED: "USB 设备拔出",
        USB_PERMISSION_GRANTED: "USB 权限已授予",
        USB_PERMISSION_DENIED: "USB 权限被拒绝",
        USB_OPEN_FAILED: "串口打开失败",
        USB_WRITE_FAILED: "串口写入失败",
        UNSUPPORTED_DEVICE: "不支持的 USB 设备",
    };
    return labels[type];
}

/**
 * 硬件事件的结果/状态标签，用于日志列表右侧状态列。
 */
export function hardwareEventResultLabel(type: HardwareEventType): string {
    switch (type) {
        case "USB_ATTACHED":
        case "USB_CONNECTED":
        case "USB_PERMISSION_GRANTED":
            return "成功";
        case "USB_DETACHED":
        case "USB_DISCONNECTED":
            return "已断开";
        case "USB_OPEN_FAILED":
        case "USB_WRITE_FAILED":
        case "USB_PERMISSION_DENIED":
        case "UNSUPPORTED_DEVICE":
            return "失败";
        default:
            return "—";
    }
}

export function hardwareEventClass(type: HardwareEventType): string {
    switch (type) {
        case "USB_ATTACHED":
        case "USB_CONNECTED":
        case "USB_PERMISSION_GRANTED":
            return "success";
        case "USB_DETACHED":
        case "USB_DISCONNECTED":
            return "neutral";
        case "USB_OPEN_FAILED":
        case "USB_WRITE_FAILED":
        case "USB_PERMISSION_DENIED":
        case "UNSUPPORTED_DEVICE":
            return "failed";
        default:
            return "neutral";
    }
}

export function webSocketStatusLabel(status: WebSocketStatus): string {
    const labels: Record<WebSocketStatus, string> = {
        idle: "未连接",
        connecting: "连接中",
        connected: "已连接",
        reconnecting: "重连中",
        disconnected: "已断开",
    };
    return labels[status];
}
