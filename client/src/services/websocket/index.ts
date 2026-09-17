import { RelayWebSocketClient } from "./RelayWebSocketClient";

export const relayWebSocket = new RelayWebSocketClient(
  import.meta.env.VITE_WS_BASE_URL,
);

export { RelayWebSocketClient } from "./RelayWebSocketClient";
export {
  parseRelayWebSocketMessage,
  websocketMessageToRelayEvent,
} from "./message";
