import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Backdrop } from '@/components/backdrop';
import { Space, useColors } from '@/constants/theme';
import { contentMaxWidth, useLayout } from '@/lib/layout';

/**
 * 画面の土台。スマホは縦1列、iPad・パソコンは幅を広げる（size="narrow" は入力画面向けに少し狭く）。
 * onRefresh を渡すと、下に引っぱって読み直せる。footer は画面下に固定（送信欄など）。
 */
export function Screen({
  header,
  children,
  onRefresh,
  footer,
  edges = ['top'],
  scroll = true,
  size = 'wide',
}: {
  header?: ReactNode;
  children: ReactNode;
  onRefresh?: () => Promise<unknown>;
  footer?: ReactNode;
  edges?: ('top' | 'bottom')[];
  scroll?: boolean;
  size?: 'wide' | 'narrow';
}) {
  const c = useColors();
  const { mode, isWide } = useLayout();
  const inner = { maxWidth: contentMaxWidth(mode, size) };
  const pad = { paddingHorizontal: isWide ? Space.xl : Space.l };
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh
    ? async () => {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
    : undefined;

  return (
    <SafeAreaView edges={header ? [] : edges} style={[styles.root, { backgroundColor: c.bg }]}>
      <Backdrop />
      {header}
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.content, pad]}
            keyboardShouldPersistTaps="handled"
            refreshControl={refresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.text} /> : undefined}>
            <View style={[styles.inner, inner]}>{children}</View>
          </ScrollView>
        ) : (
          <View style={[styles.root, styles.inner, inner]}>{children}</View>
        )}
        {footer && (
          <SafeAreaView edges={['bottom']} style={[styles.footer, pad, { backgroundColor: c.bg, borderTopColor: c.border }]}>
            <View style={[styles.inner, styles.footerInner, { maxWidth: contentMaxWidth(mode, 'narrow') }]}>{footer}</View>
          </SafeAreaView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingTop: Space.s, paddingBottom: Space.xl * 3 },
  inner: { width: '100%', maxWidth: 600, alignSelf: 'center' },
  footerInner: { gap: Space.s },
  footer: { borderTopWidth: 1, paddingTop: Space.s, paddingBottom: Space.s },
});
