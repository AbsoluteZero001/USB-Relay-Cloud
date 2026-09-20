export {
    describeUnsupportedPort,
    LCUS1_CH340_PROFILE,
    SUPPORTED_PROFILES,
    matchHardwareProfile,
    normalizeDriverName,
    normalizeUsbId,
} from "./HardwareProfile";
export type {RelayHardwareProfile} from "./HardwareProfile";
export {
    hardwareStateLabel,
} from "./HardwareStatus";
export type {
    HardwareConnectionState,
    HardwareStatus,
} from "./HardwareStatus";
