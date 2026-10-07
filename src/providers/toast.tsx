/**
 * 操作の結果を画面の下に短く出す（「出面を入れました」など）。
 * 読み上げ機能にも伝える。
 */
import * as Haptics from 'expo-haptics';
import { createContext, use, useCallback, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Icons, T } from '@/components/ui';
import { Space, useColors } from '@/constants/theme';
import { useLayout } from '@/lib/layout';

type Kind = 'ok' | 'error' | 'info';
type Toast = { id: number; message: string; kind: Kind };
type Show = (message: string, kind?: Kind) => void;

const ToastContext = createContext<Show>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { isWide } = useLayout();
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback<Show>((message, kind = 'ok') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), message, kind });
    AccessibilityInfo.announceForAccessibility(message);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(
        kind === 'error' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
    }
    // 年配の方でも読み切れるよう、長めに出す
    timer.current = setTimeout(() => setToast(null), kind === 'error' ? 6000 : 3500);
  }, []);

  const colors =
    toast?.kind === 'error'
      ? { bg: c.statusOverBg, fg: c.statusOver, icon: Icons.warning }
      : toast?.kind === 'info'
        ? { bg: c.infoBg, fg: c.info, icon: Icons.info }
        : { bg: c.okBg, fg: c.ok, icon: Icons.check };

  return (
    <ToastContext value={show}>
      {children}
      {toast && (
        <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + (isWide ? 32 : 88) }]}>
          <Pressable
            key={toast.id}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            onPress={() => setToast(null)}
            style={[styles.toast, { backgroundColor: colors.bg, borderColor: colors.fg }]}>
            <Icon name={colors.icon} size={24} color={colors.fg} />
            <T style={[styles.text, { color: c.text }]}>{toast.message}</T>
          </Pressable>
        </View>
      )}
    </ToastContext>
  );
}

export function useToast(): Show {
  return use(ToastContext);
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: Space.l },
  toast: {
    width: '100%',
    maxWidth: 560,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s,
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: Space.l,
    paddingVertical: Space.m,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  text: { flex: 1, fontSize: 17, fontWeight: '800', lineHeight: 24 },
});
