import { Tabs } from 'expo-router';

import { Icon, Icons, type IconName } from '@/components/ui';
import { fontFor } from '@/constants/fonts';
import { MinTap, useColors } from '@/constants/theme';
import { useMyPendingRequests } from '@/data/queries';
import { useLayout } from '@/lib/layout';
import { usePrefs } from '@/providers/prefs';

/**
 * メニュー：予定・現場・人工・設定
 * スマホは下のタブ（手袋でも押せる高さ、文字つき）。
 * iPad・パソコンは左のメニュー（components/side-nav.tsx）をアプリの外枠に置くので、ここではタブを出さない。
 */
export default function TabLayout() {
  const c = useColors();
  const { scale } = usePrefs();
  const { mode } = useLayout();
  const pending = useMyPendingRequests();
  const waiting = pending.data?.length ?? 0;
  const items: { name: string; title: string; icon: IconName; badge?: number }[] = [
    { name: 'index', title: '予定', icon: Icons.calendar, badge: waiting },
    { name: 'sites', title: '現場', icon: Icons.site },
    { name: 'ninku', title: '人工', icon: Icons.ninku },
    { name: 'settings', title: '設定', icon: Icons.settings },
  ];
  const side = mode !== 'phone';

  return (
    <Tabs
      tabBar={side ? () => null : undefined}
      screenOptions={{
        headerShown: false,
        tabBarPosition: 'bottom',
        sceneStyle: { backgroundColor: 'transparent' },
        tabBarActiveTintColor: c.tabActive,
        tabBarInactiveTintColor: c.tabText,
        tabBarStyle: { backgroundColor: c.tabBar, borderTopWidth: 0, minHeight: MinTap + 20 },
        tabBarItemStyle: { minHeight: MinTap + 4, paddingVertical: 4 },
        tabBarLabelStyle: { fontSize: Math.min(14 * scale, 17), ...fontFor('body', 700) },
        tabBarBadgeStyle: { fontSize: 12, fontWeight: '900' },
      }}>
      {items.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarAccessibilityLabel: t.badge ? `${t.title}、返事待ち${t.badge}件` : t.title,
            tabBarBadge: t.badge ? t.badge : undefined,
            tabBarIcon: ({ color }) => <Icon name={t.icon} size={26} color={color as string} />,
          }}
        />
      ))}
    </Tabs>
  );
}
