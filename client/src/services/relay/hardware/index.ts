export {
    describeUnsupportedPort,
    GENERIC_SERIAL_RELAY_PROFILE,
    LCUS1_CH340_PROFILE,
    SUPPORTED_PROFILES,
    matchHardwareProfile,
    matchHardwareProfileOrGeneric,
    normalizeDriverName,
    normalizeUsbId,
} from "./HardwareProfile";
export type {
    HardwareProfileMatch,
    RelayHardwareProfile,
} from "./HardwareProfile";
export {
    hardwareStateLabel,
} from "./HardwareStatus";
export type {
    HardwareConnectionState,
    HardwareStatus,
} from "./HardwareStatus";
