import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, Icons, T, type IconName } from '@/components/ui';
import { MinTap, Space, useColors } from '@/constants/theme';
import { contentMaxWidth, useLayout } from '@/lib/layout';

/** 黒帯の画面ヘッダー（戻るボタンつき）。右にボタンを1つ置ける */
export function BackHeader({
  title,
  sub,
  action,
  children,
}: {
  title: string;
  sub?: string | null;
  action?: { icon: IconName; label: string; onPress: () => void };
  /** ヘッダーの下に続けて置くもの（タブなど） */
  children?: ReactNode;
}) {
  const c = useColors();
  const { mode, isWide } = useLayout();
  const fg = '#F5F3EE';
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: c.tabBar }}>
      <View style={[styles.header, { maxWidth: contentMaxWidth(mode, 'wide') + (isWide ? 48 : 32), paddingHorizontal: isWide ? Space.xl : Space.l }]}>
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="戻る"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            style={styles.back}>
            <Icon name={Icons.back} size={26} color={fg} />
            <T style={[styles.backText, { color: fg }]}>戻る</T>
          </Pressable>
          <View style={styles.flex}>
            <T style={[styles.title, { color: fg }]} accessibilityRole="header" numberOfLines={2}>
              {title}
            </T>
            {sub ? (
              <T style={[styles.sub, { color: '#CBC7BE' }]} numberOfLines={2}>
                {sub}
              </T>
            ) : null}
          </View>
          {action && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={action.onPress}
              style={[styles.action, { borderColor: '#5C5A54' }]}>
              <Icon name={action.icon} size={22} color={fg} />
              <T style={[styles.actionText, { color: fg }]}>{action.label}</T>
            </Pressable>
          )}
        </View>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: Space.s, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.s, minHeight: MinTap },
  back: { minHeight: MinTap, flexDirection: 'row', alignItems: 'center', marginLeft: -Space.s, paddingRight: Space.xs },
  backText: { fontSize: 14, fontWeight: '800' },
  flex: { flex: 1 },
  title: { fontSize: 21, fontWeight: '900' },
  sub: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  action: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: Space.s,
  },
  actionText: { fontSize: 14, fontWeight: '800' },
});
