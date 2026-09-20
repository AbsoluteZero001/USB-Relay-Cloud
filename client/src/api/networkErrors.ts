import type {AxiosError} from "axios";

/**
 * 网络错误细分。
 *
 * 仅显示「NetworkError」完全没有排查价值，这里把 axios / 浏览器 / WebView
 * 抛出的底层信息归一成可执行的中文提示，同时保留原始 exception 供日志查看。
 */
export type NetworkFailureKind =
    | "dns"
    | "refused"
    | "timeout"
    | "ssl"
    | "cors"
    | "unreachable";

const DNS_PATTERN =
    /name or service not known|unable to resolve host|nodename nor servname|getaddrinfo|dns/i;
const SSL_PATTERN = /certificate|ssl|tls/i;
const REFUSED_PATTERN = /connection refused|econnrefused/i;
const TIMEOUT_PATTERN = /timeout|timed out|etimedout|econnaborted/i;

export function classifyNetworkError(
    error: AxiosError<unknown>,
): NetworkFailureKind {
    const code = error.code ?? "";
    const message = error.message ?? "";

    if (
        code.startsWith("ERR_CERT")
        || code === "ERR_SSL_PROTOCOL_ERROR"
        || SSL_PATTERN.test(message)
    ) {
        return "ssl";
    }
    if (code === "ERR_NAME_NOT_RESOLVED" || DNS_PATTERN.test(message)) {
        return "dns";
    }
    if (
        code === "ERR_CONNECTION_REFUSED"
        || code === "ECONNREFUSED"
        || REFUSED_PATTERN.test(message)
    ) {
        return "refused";
    }
    if (
        code === "ECONNABORTED"
        || code === "ETIMEDOUT"
        || code === "ERR_CONNECTION_TIMED_OUT"
        || TIMEOUT_PATTERN.test(message)
    ) {
        return "timeout";
    }
    if (code === "ERR_NETWORK") {
        // 浏览器出于安全考虑不会区分 CORS 与网络不可达
        return "cors";
    }
    return "unreachable";
}

export function networkFailureMessage(kind: NetworkFailureKind): string {
    switch (kind) {
        case "dns":
            return "DNS 解析失败，请检查服务器域名是否正确";
        case "refused":
            return "无法连接服务器：连接被拒绝，请检查端口与服务状态";
        case "timeout":
            return "连接超时，请检查网络或服务器状态";
        case "ssl":
            return "HTTPS 证书错误，请检查服务器证书是否有效";
        case "cors":
            return "无法连接服务器：可能是 CORS / WebView 网络限制或网络不可达";
        case "unreachable":
            return "无法连接服务器，请检查服务器地址或网络连接";
    }
}

export function isNetworkFailureCode(code: string | undefined): boolean {
    if (!code) return false;
    return code === "ERR_NETWORK"
        || code === "ECONNREFUSED"
        || code === "ENOTFOUND"
        || code === "ECONNABORTED"
        || code === "ETIMEDOUT"
        || code === "ERR_CONNECTION_TIMED_OUT"
        || code === "ERR_NAME_NOT_RESOLVED"
        || code === "ERR_CONNECTION_REFUSED"
        || code.startsWith("ERR_CERT");
}
