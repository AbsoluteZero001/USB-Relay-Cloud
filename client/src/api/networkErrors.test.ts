import type {AxiosError} from "axios";
import {describe, expect, it} from "vitest";

import {
    classifyNetworkError,
    isNetworkFailureCode,
    networkFailureMessage,
} from "./networkErrors";

function axiosError(code: string, message: string): AxiosError<unknown> {
    return {code, message} as AxiosError<unknown>;
}

describe("classifyNetworkError", () => {
    it("distinguishes DNS failures", () => {
        const error = axiosError("ERR_NAME_NOT_RESOLVED", "Network Error");
        expect(classifyNetworkError(error)).toBe("dns");
        expect(networkFailureMessage("dns")).toContain("DNS");
    });

    it("distinguishes refused connections", () => {
        expect(classifyNetworkError(
            axiosError("ERR_CONNECTION_REFUSED", "Network Error"),
        )).toBe("refused");
    });

    it("distinguishes timeouts", () => {
        expect(classifyNetworkError(
            axiosError("ECONNABORTED", "timeout of 8000ms exceeded"),
        )).toBe("timeout");
        expect(classifyNetworkError(
            axiosError("ERR_CONNECTION_TIMED_OUT", "Network Error"),
        )).toBe("timeout");
    });

    it("distinguishes certificate errors", () => {
        expect(classifyNetworkError(
            axiosError("ERR_CERT_AUTHORITY_INVALID", "Network Error"),
        )).toBe("ssl");
        expect(classifyNetworkError(
            axiosError("ERR_NETWORK", "SSL handshake failed"),
        )).toBe("ssl");
    });

    it("maps a generic browser Network Error to CORS / network", () => {
        const error = axiosError("ERR_NETWORK", "Network Error");
        expect(classifyNetworkError(error)).toBe("cors");
        expect(networkFailureMessage("cors")).toContain("CORS");
    });

    it("falls back to unreachable", () => {
        expect(classifyNetworkError(axiosError("", "Network Error")))
            .toBe("unreachable");
    });

    it("recognizes transport level error codes", () => {
        expect(isNetworkFailureCode("ERR_NETWORK")).toBe(true);
        expect(isNetworkFailureCode("ERR_CERT_DATE_INVALID")).toBe(true);
        expect(isNetworkFailureCode("ERR_BAD_REQUEST")).toBe(false);
        expect(isNetworkFailureCode(undefined)).toBe(false);
    });
});
