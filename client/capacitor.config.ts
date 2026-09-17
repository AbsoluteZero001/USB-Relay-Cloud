import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.absolutezero.usbrelaycloud",
  appName: "USB Relay Cloud",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
};

export default config;
