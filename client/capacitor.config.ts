import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.absolutezero.usbrelaycloud",
  appName: "USB Relay Cloud",
  webDir: "dist",
  /**
   * Android WebView 的固定来源（用户访问 API 时的 Origin 请求头）。
   *
   * Capacitor Android 默认值即 https://localhost，这里显式写出，
   * 避免与 Spring Boot CORS 白名单对不上：
   *   Origin: https://localhost
   * 修改这里必须同步 server/src/main/java/.../config/CorsConfig.java
   */
  server: {
    hostname: "localhost",
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
