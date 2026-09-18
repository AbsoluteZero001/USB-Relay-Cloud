import {RelayWebSocketClient} from "./RelayWebSocketClient";

import {getStoredToken} from "@/config/authStorage";
import {getWebSocketBaseUrl} from "@/config/runtimeConfig";

export const relayWebSocket = new RelayWebSocketClient(
    getWebSocketBaseUrl,
    getStoredToken,
);

export { RelayWebSocketClient } from "./RelayWebSocketClient";
export {
  parseRelayWebSocketMessage,
  websocketMessageToRelayEvent,
} from "./message";
