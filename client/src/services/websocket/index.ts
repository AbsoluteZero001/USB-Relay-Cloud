import {RelayWebSocketClient} from "./RelayWebSocketClient";

import {getWebSocketBaseUrl} from "@/config/runtimeConfig";

export const relayWebSocket = new RelayWebSocketClient(
    getWebSocketBaseUrl,
);

export { RelayWebSocketClient } from "./RelayWebSocketClient";
export {
  parseRelayWebSocketMessage,
  websocketMessageToRelayEvent,
} from "./message";
