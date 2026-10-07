import { Tabs } from 'expo-router';

import { SideNav, type NavItem } from '@/components/side-nav';
import { Icon, Icons } from '@/components/ui';
import { MinTap, useColors } from '@/constants/theme';
import { useMyPendingRequests } from '@/data/queries';
import { useLayout } from '@/lib/layout';
import { usePrefs } from '@/providers/prefs';

/**
 * メニュー：予定・現場・人工・設定
 * スマホは下のタブ（手袋でも押せる高さ、文字つき）、iPad は左の細い帯、パソコンは左の広いメニュー。
 */
export default function TabLayout() {
  const c = useColors();
  const { scale } = usePrefs();
  const { mode } = useLayout();
  const pending = useMyPendingRequests();
  const waiting = pending.data?.length ?? 0;
  const items: NavItem[] = [
    { name: 'index', title: '予定', icon: Icons.calendar, badge: waiting },
    { name: 'sites', title: '現場', icon: Icons.site },
    { name: 'ninku', title: '人工', icon: Icons.ninku },
    { name: 'settings', title: '設定', icon: Icons.settings },
  ];
  const side = mode !== 'phone';

  return (
    <Tabs
      tabBar={side ? (props) => <SideNav {...props} items={items} variant={mode === 'desktop' ? 'sidebar' : 'rail'} /> : undefined}
      screenOptions={{
        headerShown: false,
        tabBarPosition: side ? 'left' : 'bottom',
        sceneStyle: { backgroundColor: c.bg },
        tabBarActiveTintColor: c.tabActive,
        tabBarInactiveTintColor: c.tabText,
        tabBarStyle: { backgroundColor: c.tabBar, borderTopWidth: 0, minHeight: MinTap + 20 },
        tabBarItemStyle: { minHeight: MinTap + 4, paddingVertical: 4 },
        tabBarLabelStyle: { fontSize: Math.min(14 * scale, 17), fontWeight: '800' },
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
