/**
 * プッシュ通知の受け取り準備。
 * 実機の開発ビルド／本番ビルドで動く（Expo Go の Android とシミュレータでは届かない）。
 * 送る側は supabase/functions/send-push。
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from '@/data/client';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export type PushResult = 'registered' | 'denied' | 'unsupported' | 'no-project';

export async function registerForPush(userId: string): Promise<PushResult> {
  if (Platform.OS === 'web' || api.kind !== 'supabase' || !Device.isDevice) return 'unsupported';

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'ニンクル',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return 'denied';

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return 'no-project';

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api.savePushToken(userId, token, Platform.OS === 'ios' ? 'ios' : 'android');
  return 'registered';
}

/** 通知を押したときに開く画面 */
export function routeForNotification(data: Record<string, unknown> | undefined): string | null {
  const siteId = typeof data?.siteId === 'string' ? data.siteId : null;
  if (!siteId) return '/notifications';
  const tab = data?.type === 'message' ? 'yaritori' : 'yotei';
  return `/site/${siteId}?tab=${tab}`;
}
