import type {CommandStatus, EventSource, OnlineStatus, RelayStateValue, WebSocketStatus,} from "@/types/api";

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
  if (state === "UNKNOWN") return "UNKNOWN";
  return state;
}

export function onlineLabel(status: OnlineStatus): string {
    return status === "ONLINE" ? "在线" : "离线";
}

export function commandStatusLabel(status: CommandStatus): string {
    return status === "SUCCESS" ? "成功" : "失败";
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
