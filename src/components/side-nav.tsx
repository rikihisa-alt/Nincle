/**
 * iPad・パソコン用のメニュー（左側）。アプリ全体の外枠に置くので、どの画面に移っても残る。
 * - iPad：細い帯（アイコンの下に文字）
 * - パソコン：広いメニュー
 *     ・「今日の出面を入れる」ボタン
 *     ・メイン（予定・カレンダー・現場・人工・出面の記録）
 *     ・管理（承認待ち・仲間の空き・現場を作る）… 現場の管理者だけ
 *     ・進行中の現場（未読つき）へのショートカット
 *     ・その他（お知らせ・チーム・使い方・設定）
 *     ・下に、送信待ちの出面、文字の大きさと明るさの切り替え、自分の名前
 */
import { router, usePathname, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, CountBadge, Icon, Icons, T, type IconName } from '@/components/ui';
import { MinTap, siteColor, Space, useColors } from '@/constants/theme';
import { useQueuedAttendances } from '@/data/offline';
import { useAttendances, useMyPendingRequests, useMySites, useNotifications } from '@/data/queries';
import { addDays, todayJst } from '@/lib/date';
import { useMe } from '@/providers/auth';
import { TEXT_SIZE_LABEL, THEME_LABEL, usePrefs, type TextSize, type ThemePref } from '@/providers/prefs';

const FG = '#F5F3EE';
const SUB = '#B9B5AC';
const LINE = '#3A3936';
const HOVER = '#2E2D2A';

/** いまの画面の場所（メニューのどれを光らせるか） */
function areaOf(path: string): string {
  if (path === '/site/new') return 'siteNew';
  if (path.startsWith('/site/')) return `site:${path.split('/')[2]}`;
  if (path.startsWith('/sites')) return 'sites';
  if (path.startsWith('/calendar')) return 'calendar';
  if (path.startsWith('/attendance') || path.startsWith('/day')) return 'attendance';
  if (path.startsWith('/availability')) return 'availability';
  if (path.startsWith('/ninku')) return 'ninku';
  if (path.startsWith('/settings') || path.startsWith('/profile-edit')) return 'settings';
  if (path.startsWith('/notifications')) return 'notifications';
  if (path.startsWith('/team') || path.startsWith('/invite')) return 'team';
  if (path.startsWith('/help')) return 'help';
  return 'home';
}

const TEXT_ORDER: TextSize[] = ['normal', 'large', 'xlarge'];
const THEME_ORDER: ThemePref[] = ['system', 'light', 'dark'];

export function SideNav({ variant }: { variant: 'rail' | 'sidebar' }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { userId, profile } = useMe();
  const prefs = usePrefs();
  const today = todayJst();
  const area = areaOf(usePathname());
  const wide = variant === 'sidebar';

  const notifications = useNotifications();
  const pending = useMyPendingRequests();
  const sites = useMySites();
  const queued = useQueuedAttendances();
  const adminSiteIds = (sites.data ?? []).filter((s) => s.my_role === 'admin' && s.status !== 'archived').map((s) => s.id);
  const toApprove = useAttendances({ from: addDays(today, -62), to: today, siteIds: adminSiteIds }, adminSiteIds.length > 0);

  const unread = (notifications.data ?? []).filter((n) => !n.read_at && n.type !== 'message').length;
  const approvals = (toApprove.data ?? []).filter((a) => !a.approved_at && a.user_id !== userId).length;
  const isAdmin = adminSiteIds.length > 0;
  const activeSites = (sites.data ?? []).filter((s) => s.status === 'active').slice(0, 6);
  const order = (sites.data ?? []).map((s) => s.id);
  const go = (href: Href) => router.navigate(href);
  const nextText = () => prefs.setTextSize(TEXT_ORDER[(TEXT_ORDER.indexOf(prefs.textSize) + 1) % TEXT_ORDER.length]);
  const nextTheme = () => prefs.setTheme(THEME_ORDER[(THEME_ORDER.indexOf(prefs.theme) + 1) % THEME_ORDER.length]);

  const item = (key: string, icon: IconName, label: string, href: Href, badge = 0) => (
    <NavButton key={key} wide={wide} icon={icon} label={label} badge={badge} active={area === key} onPress={() => go(href)} />
  );

  return (
    <View
      style={[
        wide ? styles.sidebar : styles.rail,
        { backgroundColor: c.tabBar, paddingTop: insets.top + Space.m, paddingBottom: insets.bottom + Space.s },
      ]}>
      {wide ? (
        <View style={styles.brand}>
          <T font="brand" style={[styles.brandName, { color: c.tabActive }]}>
            ニンクル
          </T>
          <T style={[styles.brandSub, { color: SUB }]}>現場の段取りと人工</T>
        </View>
      ) : (
        <T font="brand" style={[styles.brandRail, { color: c.tabActive }]}>
          ニンクル
        </T>
      )}

      {/* いちばんよく使う操作 */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="今日の出面を入れる"
        onPress={() => go({ pathname: '/day/[date]', params: { date: today } })}
        style={({ pressed }) => [wide ? styles.quickWide : styles.quickRail, { backgroundColor: c.tabActive }, pressed && { opacity: 0.8 }]}>
        <Icon name={Icons.edit} size={wide ? 22 : 26} color={c.onAccent} />
        <T style={[wide ? styles.quickText : styles.labelRail, { color: c.onAccent }]}>{wide ? '今日の出面を入れる' : '出面'}</T>
      </Pressable>

      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Group title="メイン" wide={wide}>
          {item('home', Icons.calendar, '予定', '/', pending.data?.length ?? 0)}
          {item('calendar', Icons.calendar, 'カレンダー', '/calendar')}
          {item('sites', Icons.site, '現場', '/sites')}
          {item('ninku', Icons.ninku, '人工', '/ninku')}
          {item('attendance', Icons.list, wide ? '出面の記録' : '出面記録', '/attendance')}
        </Group>

        {isAdmin && (
          <Group title="管理" wide={wide}>
            {wide && <NavButton wide icon={Icons.check} label="承認待ち" badge={approvals} onPress={() => go('/ninku')} />}
            {item('availability', Icons.people, wide ? '仲間の空き' : '空き', '/availability')}
            {wide && item('siteNew', Icons.add, '現場を作る', '/site/new')}
          </Group>
        )}

        {wide && activeSites.length > 0 && (
          <Group title="進行中の現場" wide>
            {activeSites.map((s) => {
              const active = area === `site:${s.id}`;
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="link"
                  accessibilityLabel={`${s.name}${s.unread ? `、新着${s.unread}件` : ''}`}
                  onPress={() => go({ pathname: '/site/[id]', params: { id: s.id } })}
                  style={(state) => [
                    styles.siteItem,
                    active && { backgroundColor: HOVER, borderColor: c.tabActive },
                    !active && (state as { hovered?: boolean }).hovered && styles.hover,
                  ]}>
                  <View style={[styles.siteDot, { backgroundColor: siteColor(s.id, order) }]} />
                  <T style={[styles.siteName, { color: FG }]} numberOfLines={1}>
                    {s.name}
                  </T>
                  <CountBadge count={s.unread} />
                </Pressable>
              );
            })}
            <Pressable accessibilityRole="link" onPress={() => go('/sites')} style={styles.more}>
              <T style={[styles.moreText, { color: SUB }]}>すべての現場 ›</T>
            </Pressable>
          </Group>
        )}

        <Group title="その他" wide={wide}>
          {item('notifications', Icons.bell, 'お知らせ', '/notifications', unread)}
          {item('team', Icons.people, wide ? 'チーム・招待' : 'チーム', '/team')}
          {item('help', Icons.help, '使い方', '/help')}
          {item('settings', Icons.settings, '設定', '/settings')}
        </Group>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: LINE }]}>
        {queued.length > 0 && (
          <View style={styles.queued} accessibilityRole="text" accessibilityLabel={`送信待ちの出面 ${queued.length}件`}>
            <Icon name={Icons.wifiOff} size={18} color={c.tabActive} />
            <T style={[styles.queuedText, { color: FG }]}>{wide ? `送信待ちの出面 ${queued.length}件` : `${queued.length}`}</T>
          </View>
        )}
        {wide ? (
          <View style={styles.toggles}>
            <ToggleChip icon={Icons.text} label={`文字：${TEXT_SIZE_LABEL[prefs.textSize]}`} onPress={nextText} />
            <ToggleChip icon={Icons.sun} label={`明るさ：${prefs.theme === 'system' ? '自動' : THEME_LABEL[prefs.theme]}`} onPress={nextTheme} />
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`文字の大きさ、いまは${TEXT_SIZE_LABEL[prefs.textSize]}。押すと切り替え`}
            onPress={nextText}
            style={styles.railToggle}>
            <Icon name={Icons.text} size={24} color={FG} />
          </Pressable>
        )}
        {wide && profile && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${profile.display_name}さんの設定を開く`}
            onPress={() => go('/settings')}
            style={styles.me}>
            <Avatar name={profile.display_name} size={38} />
            <View style={styles.flex}>
              <T style={[styles.meName, { color: FG }]} numberOfLines={1}>
                {profile.display_name}
              </T>
              <T style={[styles.meSub, { color: SUB }]} numberOfLines={1}>
                {profile.trade ?? ''}
              </T>
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Group({ title, wide, children }: { title: string; wide: boolean; children: ReactNode }) {
  return (
    <View style={styles.group}>
      {wide ? (
        <T font="heading" style={[styles.groupTitle, { color: SUB }]}>
          {title}
        </T>
      ) : (
        <View style={[styles.railLine, { backgroundColor: LINE }]} />
      )}
      {children}
    </View>
  );
}

function ToggleChip({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}。押すと切り替え`}
      onPress={onPress}
      style={(state) => [styles.toggleChip, { borderColor: LINE }, (state as { hovered?: boolean }).hovered && styles.hover]}>
      <Icon name={icon} size={18} color={FG} />
      <T style={[styles.toggleText, { color: FG }]} numberOfLines={1}>
        {label}
      </T>
    </Pressable>
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
        <Icon name={icon} size={wide ? 22 : 26} color={active ? c.onAccent : FG} />
        {badge && !wide ? (
          <View style={styles.badge}>
            <CountBadge count={badge} />
          </View>
        ) : null}
      </View>
      <T style={[wide ? styles.labelWide : styles.labelRail, { color: active ? c.onAccent : FG }]} numberOfLines={1}>
        {label}
      </T>
      {badge && wide ? <CountBadge count={badge} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hover: { backgroundColor: HOVER },
  sidebar: { width: 260, paddingHorizontal: Space.m },
  rail: { width: 100, paddingHorizontal: Space.s },
  scroll: { gap: Space.m, paddingBottom: Space.m },
  brand: { paddingHorizontal: Space.s, paddingBottom: Space.m },
  brandName: { fontSize: 26, letterSpacing: 2 },
  brandSub: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  brandRail: { fontSize: 15, textAlign: 'center', paddingBottom: Space.m },
  quickWide: {
    minHeight: MinTap,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.s,
    borderRadius: 12,
    marginBottom: Space.m,
  },
  quickRail: { minHeight: MinTap + 16, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 14, marginBottom: Space.s },
  quickText: { fontSize: 16, fontWeight: '800' },
  group: { gap: 2 },
  groupTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5, paddingHorizontal: Space.s, paddingBottom: 4 },
  railLine: { height: 1, marginVertical: Space.xs },
  itemWide: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: Space.m, paddingHorizontal: Space.m, borderRadius: 10 },
  itemRail: { minHeight: MinTap + 12, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12, paddingVertical: 6 },
  labelWide: { flex: 1, fontSize: 16, fontWeight: '700' },
  labelRail: { fontSize: 12, fontWeight: '700' },
  badge: { position: 'absolute', top: -8, right: -14 },
  siteItem: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s,
    paddingHorizontal: Space.m,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  siteDot: { width: 10, height: 10, borderRadius: 5 },
  siteName: { flex: 1, fontSize: 15, fontWeight: '700' },
  more: { minHeight: 36, justifyContent: 'center', paddingHorizontal: Space.m },
  moreText: { fontSize: 14, fontWeight: '700' },
  footer: { borderTopWidth: 1, paddingTop: Space.s, gap: Space.s },
  queued: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Space.s, justifyContent: 'center' },
  queuedText: { fontSize: 13, fontWeight: '700' },
  toggles: { flexDirection: 'row', gap: 6 },
  toggleChip: {
    flex: 1,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 6,
  },
  toggleText: { fontSize: 12, fontWeight: '700' },
  railToggle: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  me: { flexDirection: 'row', alignItems: 'center', gap: Space.s, paddingHorizontal: Space.s, paddingVertical: 4 },
  meName: { fontSize: 15, fontWeight: '800' },
  meSub: { fontSize: 12, fontWeight: '600' },
});
