import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BackHeader } from '@/components/header';
import { Screen } from '@/components/screen';
import { BigButton, EmptyState, ErrorView, Icon, Icons, LoadingView, T } from '@/components/ui';
import { MinTap, Space, useColors } from '@/constants/theme';
import { api } from '@/data/client';
import { useAction, useNotifications } from '@/data/queries';
import { formatStamp, todayJst } from '@/lib/date';
import type { NotificationRow } from '@/lib/types';
import { useMe } from '@/providers/auth';

const ICON = {
  schedule_request: Icons.question,
  nudge: Icons.bell,
  assignment: Icons.calendar,
  due_over: Icons.warning,
  message: Icons.send,
} as const;

/** お知らせ一覧（やりとりの書き込みはプッシュ通知だけにして、ここには出さない） */
export default function NotificationsScreen() {
  const c = useColors();
  const { userId } = useMe();
  const { data, isLoading, error, refetch } = useNotifications();
  const { run } = useAction();
  const list = (data ?? []).filter((n) => n.type !== 'message');
  const unread = list.filter((n) => !n.read_at);

  // やりとりの通知は、開いた時点で既読にしてベルの数字に残さない
  useEffect(() => {
    const ids = (data ?? []).filter((n) => n.type === 'message' && !n.read_at).map((n) => n.id);
    if (ids.length) api.markNotificationsRead(userId, ids).catch(() => {});
  }, [data, userId]);

  const open = async (n: NotificationRow) => {
    if (!n.read_at) await api.markNotificationsRead(userId, [n.id]).catch(() => {});
    void refetch();
    if (n.payload.site_id) {
      router.push({ pathname: '/site/[id]', params: { id: n.payload.site_id, tab: 'yotei' } });
    }
  };

  return (
    <Screen size="narrow" header={<BackHeader title="お知らせ" sub={unread.length ? `未読 ${unread.length}件` : 'すべて読みました'} />} onRefresh={() => refetch()}>
      {unread.length > 0 && (
        <BigButton
          label="すべて読んだことにする"
          kind="secondary"
          compact
          onPress={() => run(() => api.markNotificationsRead(userId), '既読にしました')}
          style={styles.mt}
        />
      )}
      {error ? (
        <ErrorView message="読み込めませんでした" onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingView />
      ) : list.length === 0 ? (
        <View style={styles.mt}>
          <EmptyState title="お知らせはありません" body="予定の確認や、予定が決まったときに、ここに届きます。" />
        </View>
      ) : (
        <View style={styles.list}>
          {list.map((n) => {
            const isNew = !n.read_at;
            const fg = n.type === 'due_over' ? c.statusOver : isNew ? c.statusSoon : c.textSub;
            return (
              <Pressable
                key={n.id}
                accessibilityRole="button"
                accessibilityLabel={`${isNew ? '未読、' : ''}${n.payload.title ?? ''}、${n.payload.body ?? ''}`}
                onPress={() => open(n)}
                style={({ pressed }) => [
                  styles.item,
                  { backgroundColor: isNew ? c.card : c.cardAlt, borderColor: isNew ? fg : c.border },
                  pressed && { opacity: 0.7 },
                ]}>
                <Icon name={ICON[n.type] ?? Icons.bell} size={26} color={fg} />
                <View style={styles.flex}>
                  <T style={styles.itemTitle}>
                    {isNew ? '● ' : ''}
                    {n.payload.title}
                  </T>
                  {n.payload.body ? (
                    <T tone="textSub" style={styles.itemBody}>
                      {n.payload.body}
                    </T>
                  ) : null}
                  <T tone="textSub" style={styles.time}>
                    {formatStamp(n.created_at, todayJst())}
                  </T>
                </View>
                <Icon name={Icons.chevron} size={20} color={c.textSub} />
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  mt: { marginTop: Space.l },
  list: { gap: Space.s, marginTop: Space.l },
  item: { minHeight: MinTap + 16, flexDirection: 'row', alignItems: 'center', gap: Space.m, borderWidth: 1, borderRadius: 10, padding: Space.m },
  itemTitle: { fontSize: 17, fontWeight: '900' },
  itemBody: { fontSize: 15, fontWeight: '600', marginTop: 2, lineHeight: 22 },
  time: { fontSize: 13, fontWeight: '700', marginTop: 4 },
});
