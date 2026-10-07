import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BackHeader } from '@/components/header';
import { Screen } from '@/components/screen';
import { ChatTab } from '@/components/site/chat-tab';
import { DezuraTab } from '@/components/site/dezura-tab';
import { YoteiTab } from '@/components/site/yotei-tab';
import { EmptyState, ErrorView, Icon, Icons, LoadingView, Segmented, T } from '@/components/ui';
import { Space, useColors } from '@/constants/theme';
import { useMySites, useSite } from '@/data/queries';
import { formatShort } from '@/lib/date';
import { useLayout } from '@/lib/layout';

type Tab = 'yotei' | 'yaritori' | 'dezura';

/**
 * 現場詳細：予定／やりとり／出面
 * スマホは3つのタブを切り替え。iPad・パソコンは左に「予定／出面」、右に「やりとり」を並べて常に見せる。
 */
export default function SiteDetailScreen() {
  const params = useLocalSearchParams<{ id: string; tab?: Tab; date?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab ?? 'yotei');
  const c = useColors();
  const { isWide, isDesktop } = useLayout();
  // 横に並べるときは、やりとりは右側に出ているので左は予定か出面
  const leftTab: Tab = isWide && tab === 'yaritori' ? 'yotei' : tab;
  const { data: detail, isLoading, error, refetch } = useSite(params.id);
  const sites = useMySites();
  const unread = sites.data?.find((s) => s.id === params.id)?.unread ?? 0;

  const header = (
    <BackHeader
      title={detail?.site.name ?? '現場'}
      sub={
        detail
          ? `${detail.site.client_name ? `元請：${detail.site.client_name}　` : ''}工期\u00a0${formatShort(detail.site.start_date)}\u2060〜\u2060${formatShort(detail.site.due_date)}`
          : null
      }
      action={
        detail
          ? {
              icon: detail.myRole === 'admin' ? Icons.settings : Icons.info,
              label: detail.myRole === 'admin' ? '設定' : '情報',
              onPress: () => router.push({ pathname: '/site/[id]/settings', params: { id: detail.site.id } }),
            }
          : undefined
      }>
      {detail && (
        <Segmented
          options={
            isWide
              ? [
                  { key: 'yotei', label: '予定' },
                  { key: 'dezura', label: '出面' },
                ]
              : [
                  { key: 'yotei', label: '予定' },
                  { key: 'yaritori', label: 'やりとり', badge: tab === 'yaritori' ? 0 : unread },
                  { key: 'dezura', label: '出面' },
                ]
          }
          value={leftTab}
          onChange={setTab}
          style={[styles.tabs, isWide && styles.tabsWide]}
        />
      )}
    </BackHeader>
  );

  if (error) {
    return (
      <Screen header={header}>
        <ErrorView message="読み込めませんでした" onRetry={() => void refetch()} />
      </Screen>
    );
  }
  if (isLoading) {
    return (
      <Screen header={header}>
        <LoadingView />
      </Screen>
    );
  }
  if (!detail) {
    return (
      <Screen header={header}>
        <View style={styles.mt}>
          <EmptyState title="この現場は見られません" body="現場から外れたか、消されたかもしれません。" />
        </View>
      </Screen>
    );
  }

  if (isWide) {
    return (
      <View style={[styles.flex, { backgroundColor: c.bg }]}>
        {header}
        <View style={styles.split}>
          <ScrollView style={styles.flex} contentContainerStyle={styles.leftPane} keyboardShouldPersistTaps="handled">
            <View style={styles.leftInner}>
              {leftTab === 'yotei' ? <YoteiTab detail={detail} /> : <DezuraTab detail={detail} initialDate={params.date} />}
            </View>
          </ScrollView>
          <View style={[styles.chatPane, { width: isDesktop ? 460 : 380, borderLeftColor: c.border, backgroundColor: c.cardAlt }]}>
            <View style={[styles.chatHead, { borderBottomColor: c.border }]}>
              <Icon name={Icons.send} size={20} color={c.text} />
              <T style={styles.chatTitle}>やりとり</T>
            </View>
            <ChatTab detail={detail} />
          </View>
        </View>
      </View>
    );
  }

  if (tab === 'yaritori') {
    return (
      <Screen header={header} scroll={false}>
        <ChatTab detail={detail} />
      </Screen>
    );
  }
  return (
    <Screen header={header} onRefresh={() => refetch()} edges={['bottom']}>
      {tab === 'yotei' ? <YoteiTab detail={detail} /> : <DezuraTab detail={detail} initialDate={params.date} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  split: { flex: 1, flexDirection: 'row' },
  leftPane: { paddingHorizontal: Space.xl, paddingBottom: Space.xl * 3 },
  leftInner: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  chatPane: { borderLeftWidth: 1 },
  chatHead: { flexDirection: 'row', alignItems: 'center', gap: Space.s, paddingHorizontal: Space.l, paddingVertical: Space.m, borderBottomWidth: 1 },
  chatTitle: { fontSize: 18, fontWeight: '900' },
  tabs: { marginTop: Space.s },
  tabsWide: { maxWidth: 400 },
  mt: { marginTop: Space.l },
});
