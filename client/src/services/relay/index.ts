import {RelayService} from "./RelayService";

export const relayService = new RelayService();

export { RelayService } from "./RelayService";
export type { RelayRuntime } from "./serial";
export {
  LocalRelayProvider,
} from "./providers/LocalRelayProvider";
export type {
  RelayProvider,
  RelayProviderCommand,
  RelayProviderExecution,
} from "./providers/RelayProvider";
export {
    LCUS1_CH340_PROFILE,
    SUPPORTED_PROFILES,
    matchHardwareProfile,
    hardwareStateLabel,
} from "./hardware";
export type {
    RelayHardwareProfile,
    HardwareConnectionState,
    HardwareStatus,
} from "./hardware";
