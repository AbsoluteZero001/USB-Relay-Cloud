# Electron Adapter Status

The shared renderer already includes `ElectronSerialRelayAdapter`, which
expects the preload contract:

```text
window.desktopAPI.serial
```

The Electron main process, preload bridge, Node SerialPort dependency, and
installer are not implemented in phase one. This directory is intentionally
kept as the future integration boundary.

When implemented, the Electron adapter must:

- run Node SerialPort only in the main process
- expose a restricted IPC surface from preload
- keep `contextIsolation: true`
- keep `nodeIntegration: false`
- reuse the same LCUS-1 byte protocol and RelayService
