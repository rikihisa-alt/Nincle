import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Screen } from '@/components/screen';
import {
  BigButton,
  Chip,
  DueBadge,
  EmptyState,
  ErrorView,
  Icon,
  Icons,
  LoadingView,
  Segmented,
  T,
  Tanzaku,
  dueColor,
} from '@/components/ui';
import { fontFor } from '@/constants/fonts';
import { MinTap, Space, useColors } from '@/constants/theme';
import type { SiteListItem } from '@/data/api';
import { useMySites } from '@/data/queries';
import { daysBetween, dueState, formatShort, todayJst } from '@/lib/date';
import { Grid, useLayout } from '@/lib/layout';
import { usePrefs } from '@/providers/prefs';

type Filter = 'active' | 'completed' | 'archived';

/** 現場一覧：工程表の短冊のように、納期の近い順に並べる */
export default function SitesScreen() {
  const c = useColors();
  const { scale } = usePrefs();
  const { isWide } = useLayout();
  const { data, isLoading, error, refetch } = useMySites();
  const [filter, setFilter] = useState<Filter>('active');
  const [query, setQuery] = useState('');
  const all = data ?? [];
  const count = (f: Filter) => all.filter((s) => s.status === f).length;
  const teams = new Set(all.map((s) => s.team_id));
  const q = query.trim();
  const list = all
    .filter((s) => s.status === filter)
    .filter((s) => !q || [s.name, s.client_name, s.address].some((x) => x?.includes(q)))
    .sort((a, b) => (filter === 'active' ? a.due_date.localeCompare(b.due_date) : b.due_date.localeCompare(a.due_date)));

  return (
    <Screen onRefresh={() => refetch()}>
      <View style={styles.header}>
        <T style={styles.title} accessibilityRole="header">
          現場
        </T>
        <BigButton label="現場を作る" icon={Icons.add} compact onPress={() => router.push('/site/new')} />
      </View>

      <Segmented
        options={[
          { key: 'active', label: `進行中 ${count('active')}` },
          { key: 'completed', label: `完了 ${count('completed')}` },
          { key: 'archived', label: `アーカイブ ${count('archived')}` },
        ]}
        value={filter}
        onChange={setFilter}
        style={styles.mt}
      />

      {(all.length > 5 || isWide) && (
        <View style={[styles.search, { borderColor: c.border, backgroundColor: c.card }]}>
          <Icon name={Icons.search} size={22} color={c.textSub} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="現場名・元請け・住所でさがす"
            placeholderTextColor={c.textSub}
            accessibilityLabel="現場をさがす"
            maxFontSizeMultiplier={1.6}
            style={[styles.searchInput, fontFor('body', 400), { color: c.text, fontSize: 17 * scale }]}
          />
        </View>
      )}

      {error ? (
        <ErrorView message="読み込めませんでした" onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingView />
      ) : list.length === 0 ? (
        <View style={styles.mt}>
          <EmptyState
            title={q ? '見つかりませんでした' : filter === 'active' ? '進行中の現場はありません' : filter === 'completed' ? '完了した現場はありません' : 'アーカイブした現場はありません'}
            body={filter === 'active' && !q ? '「現場を作る」から、新しい仕事を登録できます。' : undefined}
          />
        </View>
      ) : (
        <View style={styles.list}>
          <Grid>
            {list.map((s) => (
              <SiteCard key={s.id} site={s} showTeam={teams.size > 1} />
            ))}
          </Grid>
        </View>
      )}
    </Screen>
  );
}

function SiteCard({ site, showTeam }: { site: SiteListItem; showTeam: boolean }) {
  const c = useColors();
  const today = todayJst();
  const state = dueState(today, site.due_date);
  return (
    <Tanzaku
      stripe={site.status === 'active' ? dueColor(c, state).fg : c.border}
      onPress={() => router.push({ pathname: '/site/[id]', params: { id: site.id } })}
      accessibilityLabel={`${site.name}${site.unread ? `、新着${site.unread}件` : ''}`}>
      <View style={styles.row}>
        <T style={styles.siteName}>{site.name}</T>
        <Icon name={Icons.chevron} size={22} color={c.textSub} />
      </View>
      <T tone="textSub" style={styles.meta}>
        {[site.client_name ? `元請：${site.client_name}` : null, `${formatShort(site.start_date)}〜${formatShort(site.due_date)}`, showTeam ? site.team_name : null]
          .filter(Boolean)
          .join(' ／ ')}
      </T>
      <View style={styles.chips}>
        {site.status === 'active' ? (
          <DueBadge state={state} daysLeft={daysBetween(today, site.due_date)} />
        ) : (
          <Chip
            label={site.status === 'completed' ? '完了（精算待ち）' : 'アーカイブ'}
            icon={site.status === 'completed' ? Icons.check : Icons.archive}
            fg={c.textSub}
            bg={c.cardAlt}
          />
        )}
        {site.my_role === 'admin' && <Chip label="管理" icon={Icons.crown} fg={c.text} bg={c.cardAlt} />}
        <Chip label={`${site.member_count}人`} icon={Icons.people} fg={c.textSub} bg={c.card} />
        {site.unread > 0 && <Chip label={`新着 ${site.unread}`} icon={Icons.bell} fg={c.info} bg={c.infoBg} />}
      </View>
    </Tanzaku>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: Space.l, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Space.s },
  title: { fontSize: 30, fontWeight: '900' },
  mt: { marginTop: Space.l },
  search: { marginTop: Space.m, flexDirection: 'row', alignItems: 'center', gap: Space.s, borderWidth: 1, borderRadius: 10, paddingHorizontal: Space.m },
  searchInput: { flex: 1, minHeight: MinTap },
  list: { gap: Space.s, marginTop: Space.l },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Space.s },
  siteName: { fontSize: 21, fontWeight: '900', flexShrink: 1 },
  meta: { fontSize: 15, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.s },
});
