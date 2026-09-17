# Device Protocol

## Verified LCUS-1 Commands

| Action | Bytes | Hex |
| --- | --- | --- |
| Relay 1 ON | `[A0, 01, 01, A2]` | `A0 01 01 A2` |
| Relay 1 OFF | `[A0, 01, 00, A1]` | `A0 01 00 A1` |

Default serial parameters:

| Parameter | Value |
| --- | --- |
| Baud rate | 9600 |
| Data bits | 8 |
| Parity | None |
| Stop bits | 1 |
| Flow control | None |

These bytes are verified for Windows Electron + Node SerialPort and are
reused by the Android USB Host provider. Android USB OTG and LCUS-1
hardware control have not been verified in this repository.

## No State Readback

No reliable LCUS-1 hardware readback protocol has been verified.
Therefore:

- serial write success means only that bytes were written
- `commandedState` is the last successful software command
- `hardwareState` is always `UNKNOWN`
- UI must not claim physical contact confirmation
