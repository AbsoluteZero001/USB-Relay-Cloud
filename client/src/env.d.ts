/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 可选：Web 构建期的 REST 地址；不设置时使用同源 /api */
  readonly VITE_API_BASE_URL?: string;
  /** 可选：Web 构建期的 WebSocket 地址；不设置时由 origin 派生 */
  readonly VITE_WS_BASE_URL?: string;
  readonly VITE_APP_ENV?: string;
  /**
   * 构建期烘焙的默认服务器根地址（绝对 URL）。
   * 仅作为「用户从未保存过服务器地址」时的回退，生产 Nginx 同源部署不设置。
   */
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
