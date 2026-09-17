import { RelayService } from "./RelayService";

export const relayService = new RelayService();

export { RelayService } from "./RelayService";
export type { RelayRuntime } from "./serial";
export {
  DEFAULT_RELAY_PROTOCOL,
  LocalRelayProvider,
} from "./providers/LocalRelayProvider";
export type {
  RelayProvider,
  RelayProviderCommand,
  RelayProviderExecution,
} from "./providers/RelayProvider";
