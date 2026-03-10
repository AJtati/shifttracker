import { registerPlugin } from "@capacitor/core";

export interface FirebaseConfigPlugin {
  isPushRuntimeConfigured(): Promise<{ configured: boolean }>;
  isTvDevice(): Promise<{ tv: boolean }>;
  openAppNotificationSettings(): Promise<{ opened: boolean }>;
  openNotificationChannelSettings(options: { channelId: string }): Promise<{ opened: boolean }>;
}

export const FirebaseConfig = registerPlugin<FirebaseConfigPlugin>("FirebaseConfig");

