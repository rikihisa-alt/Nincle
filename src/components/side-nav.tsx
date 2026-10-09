/**
 * iPad・パソコン用のメニュー（左側）。アプリ全体の外枠に置くので、どの画面に移っても残る。
 * - iPad：細い帯（アイコンの下に文字）
 * - パソコン：広いメニュー（アプリ名・自分の名前・お知らせ・チーム・使い方への入口つき）
 */
import { router, usePathname, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, CountBadge, Icon, Icons, T, type IconName } from '@/components/ui';
import { MinTap, Space, useColors } from '@/constants/theme';
import { useMyPendingRequests, useNotifications } from '@/data/queries';
import { useMe } from '@/providers/auth';

type Area = 'home' | 'sites' | 'ninku' | 'settings' | 'notifications' | 'team' | 'help';

/** いまの画面が、メニューのどこに当たるか（現場の詳細や日ごとの画面も、元のメニューを光らせる） */
function areaOf(path: string): Area {
  if (path.startsWith('/site')) return 'sites';
  if (path.startsWith('/ninku')) return 'ninku';
  if (path.startsWith('/settings') || path.startsWith('/profile-edit')) return 'settings';
  if (path.startsWith('/notifications')) return 'notifications';
  if (path.startsWith('/team') || path.startsWith('/invite')) return 'team';
  if (path.startsWith('/help')) return 'help';
  return 'home';
}

const MAIN: { area: Area; title: string; icon: IconName; href: Href }[] = [
  { area: 'home', title: '予定', icon: Icons.calendar, href: '/' },
  { area: 'sites', title: '現場', icon: Icons.site, href: '/sites' },
  { area: 'ninku', title: '人工', icon: Icons.ninku, href: '/ninku' },
  { area: 'settings', title: '設定', icon: Icons.settings, href: '/settings' },
];

export function SideNav({ variant }: { variant: 'rail' | 'sidebar' }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { profile } = useMe();
  const notifications = useNotifications();
  const pending = useMyPendingRequests();
  const unread = (notifications.data ?? []).filter((n) => !n.read_at && n.type !== 'message').length;
  const area = areaOf(usePathname());
  const sub = '#CBC7BE';
  const fg = '#F5F3EE';
  const wide = variant === 'sidebar';
  const go = (href: Href) => router.navigate(href);
  const items = MAIN.map((m) => ({ ...m, badge: m.area === 'home' ? (pending.data?.length ?? 0) : 0 }));

  return (
    <View
      style={[
        wide ? styles.sidebar : styles.rail,
        { backgroundColor: c.tabBar, paddingTop: insets.top + Space.m, paddingBottom: insets.bottom + Space.m },
      ]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {wide ? (
          <View style={styles.brand}>
            <T font="brand" style={[styles.brandName, { color: c.tabActive }]}>
              ニンクル
            </T>
            <T style={[styles.brandSub, { color: sub }]}>現場の段取りと人工</T>
          </View>
        ) : (
          <T font="brand" style={[styles.brandRail, { color: c.tabActive }]}>
            ニンクル
          </T>
        )}

        <View style={styles.group} accessibilityRole="tablist">
          {items.map((it) => (
            <NavButton wide={wide} key={it.area} icon={it.icon} label={it.title} active={area === it.area} badge={it.badge} onPress={() => go(it.href)} />
          ))}
        </View>

        <View style={[styles.divider, { backgroundColor: '#3A3936' }]} />
        <View style={styles.group}>
          <NavButton wide={wide} icon={Icons.bell} label="お知らせ" badge={unread} active={area === 'notifications'} onPress={() => go('/notifications')} />
          <NavButton wide={wide} icon={Icons.people} label={wide ? 'チーム・招待' : 'チーム'} active={area === 'team'} onPress={() => go('/team')} />
          <NavButton wide={wide} icon={Icons.help} label="使い方" active={area === 'help'} onPress={() => go('/help')} />
        </View>
      </ScrollView>

      {wide && profile && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${profile.display_name}さんの設定を開く`}
          onPress={() => go('/settings')}
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
