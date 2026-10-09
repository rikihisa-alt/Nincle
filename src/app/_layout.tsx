import { focusManager, QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { LinearGradient } from 'expo-linear-gradient';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';

import { ConfirmHost } from '@/components/confirm-host';
import { SideNav } from '@/components/side-nav';
import { useAppFonts } from '@/constants/fonts';
import { useColors, useIsDark } from '@/constants/theme';
import { api } from '@/data/client';
import { flushQueue, takeRejectedReason } from '@/data/offline';
import { useLayout } from '@/lib/layout';
import { isSupabaseConfigured } from '@/lib/supabase';
import { registerForPush, routeForNotification } from '@/lib/push';
import { AuthProvider, pendingInvite, useAuth } from '@/providers/auth';
import { PrefsProvider } from '@/providers/prefs';
import { ToastProvider, useToast } from '@/providers/toast';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15000, retry: 1 } },
});

// アプリが前に戻ってきたら読み直す
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
}

export default function RootLayout() {
  return (
    <PrefsProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <ThemedStatusBar />
            <NavTheme>
              <RootStack />
            </NavTheme>
            <ConfirmHost />
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </PrefsProvider>
  );
}

function ThemedStatusBar() {
  return <StatusBar style={useIsDark() ? 'light' : 'dark'} />;
}

/** 画面切り替えの背景を透明にして、下のグラデーションとクリアパネルを見せる */
function NavTheme({ children }: { children: ReactNode }) {
  const dark = useIsDark();
  const c = useColors();
  const base = dark ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider
      value={{
        ...base,
        colors: { ...base.colors, background: 'transparent', card: c.tabBar, text: c.text, border: c.border, primary: c.accent },
      }}>
      {children}
    </ThemeProvider>
  );
}

function RootStack() {
  const c = useColors();
  const { mode } = useLayout();
  const { loading: authLoading, userId, profileComplete } = useAuth();
  const fontsReady = useAppFonts();
  const loading = authLoading || !fontsReady;
  const signedIn = Boolean(userId);
  const ready = signedIn && (profileComplete || !isSupabaseConfigured);

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  // ログイン前に開いた招待リンクへ戻す
  useEffect(() => {
    if (loading || !ready || !isSupabaseConfigured) return;
    pendingInvite.take().then((token) => {
      if (token) router.push({ pathname: '/invite/[token]', params: { token } });
    });
  }, [loading, ready]);

  if (loading) return null;

  return (
    <View style={styles.app}>
      {/* コンクリート調の薄いグラデーション。パネルはこの上に半透明で重なる */}
      <LinearGradient
        colors={c.bgGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {ready && userId && <BackgroundTasks userId={userId} />}
      {ready && mode !== 'phone' && <SideNav variant={mode === 'desktop' ? 'sidebar' : 'rail'} />}
      <View style={styles.main}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: 'transparent' },
          }}>
          <Stack.Protected guard={ready}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="site/new" />
            <Stack.Screen name="site/[id]/index" />
            <Stack.Screen name="site/[id]/settings" />
            <Stack.Screen name="site/[id]/request" />
            <Stack.Screen name="site/[id]/assign" />
            <Stack.Screen name="site/[id]/confirm/[requestId]" />
            <Stack.Screen name="day/[date]" />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="team/index" />
            <Stack.Screen name="team/[id]" />
            <Stack.Screen name="profile-edit" />
            <Stack.Screen name="help" />
          </Stack.Protected>
          <Stack.Protected guard={isSupabaseConfigured && !signedIn}>
            <Stack.Screen name="login" />
          </Stack.Protected>
          <Stack.Protected guard={isSupabaseConfigured && signedIn && !profileComplete}>
            <Stack.Screen name="profile-setup" />
          </Stack.Protected>
          <Stack.Screen name="invite/[token]" />
        </Stack>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, flexDirection: 'row' },
  main: { flex: 1 },
});

/** ログイン中ずっと動かすもの：ためた出面の送信、通知の受け取り */
function BackgroundTasks({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const toast = useToast();

  // 電波が戻ったら、ためていた出面を送る
  useEffect(() => {
    const tryFlush = async () => {
      const sent = await flushQueue();
      if (sent > 0) {
        toast(`ためていた出面を${sent}件送りました`, 'ok');
        qc.invalidateQueries();
      }
      const rejected = takeRejectedReason();
      if (rejected) toast(`送れなかった出面があります：${rejected}`, 'error');
    };
    void tryFlush();
    const timer = setInterval(tryFlush, 20000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void tryFlush();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [qc, toast]);

  // アプリ内の通知（ベルの数字）
  useEffect(
    () =>
      api.subscribeNotifications(userId, () => {
        qc.invalidateQueries({ queryKey: ['notifications'] });
        qc.invalidateQueries({ queryKey: ['pendingRequests'] });
        qc.invalidateQueries({ queryKey: ['sites'] });
      }),
    [userId, qc],
  );

  // プッシュ通知の登録と、押されたときの移動
  useEffect(() => {
    if (Platform.OS === 'web') return;
    registerForPush(userId).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const to = routeForNotification(res.notification.request.content.data as Record<string, unknown>);
      if (to) router.push(to as never);
    });
    return () => sub.remove();
  }, [userId]);

  return null;
}
