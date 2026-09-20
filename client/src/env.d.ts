/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_WS_BASE_URL: string;
  readonly VITE_APP_ENV?: string;
    /** Debug/本地构建烘焙的默认服务器地址（绝对 URL），生产 Nginx 同源部署不设置。 */
    readonly VITE_DEFAULT_SERVER_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface DesktopSerialPort {
  port: string;
  device: string;
  description: string;
  manufacturer: string | null;
  hwid: string | null;
  vendorId: string | null;
  productId: string | null;
  serialNumber: string | null;
  is_current: boolean;
}

interface DesktopApi {
  isElectron: true;
  platform: string;
  serial: {
    listPorts(): Promise<DesktopSerialPort[]>;
    connect(
      portId: string,
      options: {
        baudRate: number;
        dataBits: number;
        stopBits: number;
        parity: string;
        flowControl?: string;
      },
    ): Promise<{
      state: string;
      connected: boolean;
      port: string | null;
      error_code: string | null;
      detail: string | null;
    }>;
    disconnect(): Promise<void>;
    send(data: number[]): Promise<void>;
  };
}

interface Window {
  desktopAPI?: DesktopApi;
}
