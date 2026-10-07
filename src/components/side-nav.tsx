/**
 * iPad・パソコン用のメニュー（左側）。
 * - iPad：細い帯（アイコンの下に文字）
 * - パソコン：広いメニュー（アプリ名・自分の名前・お知らせ・チーム・使い方への入口つき）
 */
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar, CountBadge, Icon, Icons, T, type IconName } from '@/components/ui';
import { MinTap, Space, useColors } from '@/constants/theme';
import { useNotifications } from '@/data/queries';
import { useMe } from '@/providers/auth';

export type NavItem = { name: string; title: string; icon: IconName; badge?: number };

export function SideNav({
  state,
  navigation,
  insets,
  items,
  variant,
}: BottomTabBarProps & { items: NavItem[]; variant: 'rail' | 'sidebar' }) {
  const c = useColors();
  const { profile } = useMe();
  const notifications = useNotifications();
  const unread = (notifications.data ?? []).filter((n) => !n.read_at && n.type !== 'message').length;
  const current = state.routes[state.index]?.name;
  const fg = '#F5F3EE';
  const sub = '#CBC7BE';
  const wide = variant === 'sidebar';

  const go = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (current !== name && !event.defaultPrevented) navigation.navigate(name);
  };

  return (
    <View
      style={[
        wide ? styles.sidebar : styles.rail,
        { backgroundColor: c.tabBar, paddingTop: insets.top + Space.m, paddingBottom: insets.bottom + Space.m },
      ]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {wide ? (
          <View style={styles.brand}>
            <T style={[styles.brandName, { color: c.tabActive }]}>ニンクル</T>
            <T style={[styles.brandSub, { color: sub }]}>現場の段取りと人工</T>
          </View>
        ) : (
          <T style={[styles.brandRail, { color: c.tabActive }]}>ニンクル</T>
        )}

        <View style={styles.group} accessibilityRole="tablist">
          {items.map((it) => (
            <NavButton wide={wide} key={it.name} icon={it.icon} label={it.title} active={current === it.name} badge={it.badge} onPress={() => go(it.name)} />
          ))}
        </View>

        <View style={[styles.divider, { backgroundColor: '#3A3936' }]} />
        <View style={styles.group}>
          <NavButton wide={wide} icon={Icons.bell} label="お知らせ" badge={unread} onPress={() => router.push('/notifications')} />
          {wide && <NavButton wide={wide} icon={Icons.people} label="チーム・招待" onPress={() => router.push('/team')} />}
          {wide && <NavButton wide={wide} icon={Icons.help} label="使い方" onPress={() => router.push('/help')} />}
        </View>
      </ScrollView>

      {wide && profile && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${profile.display_name}さんの設定を開く`}
          onPress={() => go('settings')}
          style={[styles.me, { borderTopColor: '#3A3936' }]}>
          <Avatar name={profile.display_name} size={40} />
          <View style={styles.flex}>
            <T style={[styles.meName, { color: fg }]} numberOfLines={1}>
              {profile.display_name}
            </T>
            <T style={[styles.meSub, { color: sub }]} numberOfLines={1}>
              {profile.trade ?? ''}
            </T>
          </View>
        </Pressable>
      )}
    </View>
  );
}

function NavButton({
  wide,
  icon,
  label,
  active,
  badge,
  onPress,
}: {
  wide: boolean;
  icon: IconName;
  label: string;
  active?: boolean;
  badge?: number;
  onPress: () => void;
}) {
  const c = useColors();
  const fg = '#F5F3EE';
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={badge ? `${label}、${badge}件` : label}
      onPress={onPress}
      style={(state) => [
        wide ? styles.itemWide : styles.itemRail,
        active && { backgroundColor: c.tabActive },
        !active && (state as { hovered?: boolean }).hovered && styles.hover,
        state.pressed && { opacity: 0.7 },
      ]}>
      <View>
        <Icon name={icon} size={wide ? 24 : 28} color={active ? c.onAccent : fg} />
        {badge && !wide ? (
          <View style={styles.badge}>
            <CountBadge count={badge} />
          </View>
        ) : null}
      </View>
      <T style={[wide ? styles.labelWide : styles.labelRail, { color: active ? c.onAccent : fg }]} numberOfLines={1}>
        {label}
      </T>
      {badge && wide ? <CountBadge count={badge} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hover: { backgroundColor: '#2E2D2A' },
  flex: { flex: 1 },
  sidebar: { width: 248, paddingHorizontal: Space.m },
  rail: { width: 96, paddingHorizontal: Space.s },
  scroll: { gap: Space.s },
  brand: { paddingHorizontal: Space.s, paddingBottom: Space.l },
  brandName: { fontSize: 26, fontWeight: '900', letterSpacing: 2 },
  brandSub: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  brandRail: { fontSize: 14, fontWeight: '900', textAlign: 'center', paddingBottom: Space.m },
  group: { gap: Space.xs },
  itemWide: {
    minHeight: MinTap,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.m,
    paddingHorizontal: Space.m,
    borderRadius: 10,
  },
  itemRail: { minHeight: MinTap + 16, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12, paddingVertical: Space.s },
  labelWide: { flex: 1, fontSize: 17, fontWeight: '800' },
  labelRail: { fontSize: 13, fontWeight: '800' },
  badge: { position: 'absolute', top: -8, right: -14 },
  divider: { height: 1, marginVertical: Space.s },
  me: { flexDirection: 'row', alignItems: 'center', gap: Space.s, borderTopWidth: 1, paddingTop: Space.m, paddingHorizontal: Space.s },
  meName: { fontSize: 16, fontWeight: '800' },
  meSub: { fontSize: 13, fontWeight: '600' },
});
