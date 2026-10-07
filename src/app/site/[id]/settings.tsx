import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CheckRow, ErrorText, MoneyField } from '@/components/form';
import { BackHeader } from '@/components/header';
import { Screen } from '@/components/screen';
import { SiteFields, validateSite, type SiteFormValue } from '@/components/site/site-form';
import { Avatar, BigButton, Card, Chip, ErrorView, Hint, Icon, Icons, LoadingView, SectionLabel, T } from '@/components/ui';
import { MinTap, Space, useColors } from '@/constants/theme';
import type { SiteDetail, SiteMember } from '@/data/api';
import { api } from '@/data/client';
import { useAction, useSite, useTeam } from '@/data/queries';
import { confirm } from '@/lib/confirm';
import { formatLong, formatShort } from '@/lib/date';
import { describeOvertimeRule, formatYen } from '@/lib/ninku';
import { useSheetStyle } from '@/lib/layout';
import { useMe } from '@/providers/auth';

const STATUS_LABEL = { active: '進行中', completed: '完了（精算待ち）', archived: 'アーカイブ' } as const;

/** 現場の設定（管理者）／現場の情報（メンバー） */
export default function SiteSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: detail, isLoading, error, refetch } = useSite(id);
  const isAdmin = detail?.myRole === 'admin';
  const header = <BackHeader title={isAdmin ? '現場の設定' : '現場の情報'} sub={detail?.site.name} />;

  if (error) {
    return (
      <Screen size="narrow" header={header}>
        <ErrorView message="読み込めませんでした" onRetry={() => void refetch()} />
      </Screen>
    );
  }
  if (isLoading || !detail) {
    return (
      <Screen size="narrow" header={header}>
        <LoadingView />
      </Screen>
    );
  }
  return (
    <Screen size="narrow" header={header}>
      {isAdmin ? <AdminSettings detail={detail} /> : <ReadOnlyInfo detail={detail} />}
      <MemberList detail={detail} />
      {isAdmin && <StatusActions detail={detail} />}
    </Screen>
  );
}

function ReadOnlyInfo({ detail }: { detail: SiteDetail }) {
  const { site, members } = detail;
  const { userId } = useMe();
  const myPrice = members.find((m) => m.user_id === userId)?.unit_price ?? site.default_unit_price;
  const rows: [string, string][] = [
    ['状態', STATUS_LABEL[site.status]],
    ['元請け', site.client_name ?? '—'],
    ['住所', site.address ?? '—'],
    ['工期', `${formatLong(site.start_date)} 〜 ${formatLong(site.due_date)}`],
    ['あなたの人工単価', `${formatYen(myPrice)}円`],
    ['残業の換算', describeOvertimeRule(site.overtime_rule)],
    ['メモ', site.memo ?? '—'],
  ];
  return (
    <>
      <SectionLabel>現場の情報</SectionLabel>
      <InfoTable rows={rows} />
    </>
  );
}

function InfoTable({ rows }: { rows: [string, string][] }) {
  const c = useColors();
  return (
    <Card>
      {rows.map(([k, v], i) => (
        <View key={k} style={[styles.infoRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
          <T tone="textSub" style={styles.infoKey}>
            {k}
          </T>
          <T style={styles.infoVal}>{v}</T>
        </View>
      ))}
    </Card>
  );
}

function AdminSettings({ detail }: { detail: SiteDetail }) {
  const { site } = detail;
  const { run, busy } = useAction();
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState<SiteFormValue>({
    name: site.name,
    address: site.address ?? '',
    clientName: site.client_name ?? '',
    startDate: site.start_date,
    dueDate: site.due_date,
    defaultUnitPrice: site.default_unit_price,
    overtimeRule: site.overtime_rule,
    memo: site.memo ?? '',
  });

  const save = async () => {
    const problem = validateSite(value);
    setError(problem);
    if (problem) return;
    const priceChanged = value.defaultUnitPrice !== site.default_unit_price;
    if (
      priceChanged &&
      !(await confirm(
        '単価を変える',
        `既定の人工単価を${formatYen(value.defaultUnitPrice!)}円にします。確定していない月の出面にも新しい単価がつきます（確定済みの月は変わりません）。`,
        '変える',
      ))
    ) {
      return;
    }
    await run(
      () =>
        api.updateSite(site.id, {
          name: value.name.trim(),
          address: value.address.trim() || null,
          client_name: value.clientName.trim() || null,
          start_date: value.startDate!,
          due_date: value.dueDate!,
          default_unit_price: value.defaultUnitPrice!,
          overtime_rule: value.overtimeRule,
          memo: value.memo.trim() || null,
        }),
      '現場の設定を保存しました',
    );
  };

  return (
    <>
      <SectionLabel>現場の内容</SectionLabel>
      <Hint>残業の換算を変えても、すでに入れた出面の人工は変わりません（入れたときの決まりで計算済み）。</Hint>
      <SiteFields value={value} onChange={setValue} />
      <ErrorText>{error}</ErrorText>
      <BigButton label="保存する" icon={Icons.check} busy={busy} onPress={save} style={styles.mt} />
    </>
  );
}

function MemberList({ detail }: { detail: SiteDetail }) {
  const c = useColors();
  const { userId } = useMe();
  const { site, members, myRole, team } = detail;
  const isAdmin = myRole === 'admin';
  const writable = site.status !== 'archived';
  const { run } = useAction();
  const teamDetail = useTeam(isAdmin ? team.id : null);
  const [priceFor, setPriceFor] = useState<SiteMember | null>(null);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const candidates = (teamDetail.data?.members ?? []).filter((m) => !members.some((x) => x.user_id === m.user_id));

  const remove = async (m: SiteMember) => {
    if (!(await confirm(`${m.user?.display_name}さんを外す`, 'これまでの出面とやりとりは残ります。', '外す'))) return;
    await run(() => api.removeSiteMember(site.id, m.user_id), `${m.user?.display_name}さんを外しました`);
  };

  return (
    <>
      <SectionLabel>{`メンバー（${members.length}人）`}</SectionLabel>
      <Card>
        {members.map((m, i) => (
          <View key={m.user_id} style={[styles.memberRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
            <View style={styles.memberHead}>
              <Avatar name={m.user?.display_name ?? '？'} size={40} />
              <View style={styles.flex}>
                <T style={styles.memberName}>
                  {m.user?.display_name}
                  {m.user_id === userId ? '（自分）' : ''}
                </T>
                <T tone="textSub" style={styles.meta}>
                  {[m.user?.trade, isAdmin ? `単価 ${formatYen(m.unit_price ?? site.default_unit_price)}円${m.unit_price === null ? '（既定）' : ''}` : null]
                    .filter(Boolean)
                    .join(' ／ ')}
                </T>
              </View>
              {m.role === 'admin' && <Chip label="管理者" icon={Icons.crown} fg={c.text} bg={c.cardAlt} />}
            </View>
            <View style={styles.memberActions}>
              {m.user?.phone ? (
                <BigButton
                  label="電話"
                  icon={Icons.phone}
                  kind="secondary"
                  compact
                  onPress={() => Linking.openURL(`tel:${m.user!.phone!.replace(/[^\d+]/g, '')}`)}
                  style={styles.flex}
                />
              ) : null}
              {isAdmin && writable && (
                <BigButton label="単価" icon={Icons.edit} kind="secondary" compact onPress={() => setPriceFor(m)} style={styles.flex} />
              )}
              {isAdmin && writable && m.user_id !== userId && (
                <BigButton label="外す" kind="danger" compact onPress={() => remove(m)} style={styles.flex} />
              )}
            </View>
          </View>
        ))}
      </Card>

      {isAdmin && writable && (
        <>
          {!adding ? (
            <BigButton
              label="チームから呼ぶ"
              icon={Icons.add}
              kind="secondary"
              onPress={() => {
                setPicked([]);
                setAdding(true);
              }}
              style={styles.mt}
            />
          ) : (
            <View style={styles.addBox}>
              <T style={styles.addTitle}>現場に入れる人を選ぶ</T>
              {candidates.length === 0 ? (
                <T tone="textSub" style={styles.meta}>
                  チームの全員がもう入っています。新しい仲間は「チーム」から招待してください。
                </T>
              ) : (
                candidates.map((m) => (
                  <CheckRow
                    key={m.user_id}
                    label={m.user?.display_name ?? ''}
                    sub={m.user?.trade ?? undefined}
                    checked={picked.includes(m.user_id)}
                    onToggle={() => setPicked(picked.includes(m.user_id) ? picked.filter((x) => x !== m.user_id) : [...picked, m.user_id])}
                  />
                ))
              )}
              <View style={styles.row}>
                <BigButton label="やめる" kind="ghost" onPress={() => setAdding(false)} style={styles.flex} />
                <BigButton
                  label={`${picked.length}人を入れる`}
                  disabled={picked.length === 0}
                  onPress={async () => {
                    await run(() => api.addSiteMembers(site.id, picked), `${picked.length}人を現場に入れました`);
                    setAdding(false);
                  }}
                  style={styles.flex}
                />
              </View>
            </View>
          )}
        </>
      )}
      {priceFor && <PriceModal site={detail} member={priceFor} onClose={() => setPriceFor(null)} />}
    </>
  );
}

function PriceModal({ site, member, onClose }: { site: SiteDetail; member: SiteMember; onClose: () => void }) {
  const c = useColors();
  const sheet = useSheetStyle();
  const { run, busy } = useAction();
  const [price, setPrice] = useState<number | null>(member.unit_price);
  const save = async (value: number | null) => {
    await run(
      () => api.updateSiteMember(site.site.id, member.user_id, { unit_price: value }),
      value === null ? '既定の単価に戻しました' : `${member.user?.display_name}さんの単価を${formatYen(value)}円にしました`,
    );
    onClose();
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, sheet.backdrop, { backgroundColor: c.overlay }]}>
        <SafeAreaView edges={['bottom']} style={[styles.sheet, sheet.sheet, { backgroundColor: c.bg }]}>
          <View style={styles.sheetHeader}>
            <T style={styles.sheetTitle}>{member.user?.display_name}さんの人工単価</T>
            <Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={onClose} style={styles.close}>
              <Icon name={Icons.close} size={26} color={c.text} />
            </Pressable>
          </View>
          <MoneyField
            label="この人だけの単価"
            value={price}
            onChange={setPrice}
            placeholder={String(site.site.default_unit_price)}
            hint={`空にすると、現場の既定（${formatYen(site.site.default_unit_price)}円）になります。確定していない月の出面にも反映されます。`}
          />
          <BigButton label="保存する" busy={busy} onPress={() => save(price)} style={styles.mt} />
          {member.unit_price !== null && (
            <BigButton label="既定の単価に戻す" kind="ghost" onPress={() => save(null)} style={styles.mt} />
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function StatusActions({ detail }: { detail: SiteDetail }) {
  const { site } = detail;
  const { run, busy } = useAction();
  const set = async (status: 'active' | 'completed' | 'archived', title: string, body: string, ok: string, done: string) => {
    if (!(await confirm(title, body, ok))) return;
    await run(() => api.updateSite(site.id, { status }), done);
    if (status === 'archived') router.back();
  };
  return (
    <>
      <SectionLabel>{`現場の状態：${STATUS_LABEL[site.status]}`}</SectionLabel>
      <View style={styles.gap}>
        {site.status === 'active' && (
          <BigButton
            label="完了にする（精算待ち）"
            icon={Icons.check}
            kind="secondary"
            busy={busy}
            onPress={() => set('completed', '完了にする', '作業が終わった現場にします。出面の入力と集計はそのままできます。', '完了にする', '完了にしました')}
          />
        )}
        {site.status !== 'archived' && (
          <BigButton
            label="アーカイブする"
            icon={Icons.archive}
            kind="secondary"
            busy={busy}
            onPress={() =>
              set('archived', 'アーカイブする', '一覧から外して見るだけにします。やりとり・出面・集計は残り、いつでも再開できます。', 'アーカイブ', 'アーカイブしました')
            }
          />
        )}
        {site.status !== 'active' && (
          <BigButton
            label="進行中に戻す（再開）"
            icon={Icons.unlock}
            kind="secondary"
            busy={busy}
            onPress={() => set('active', '再開する', '進行中の現場に戻します。', '再開する', '再開しました')}
          />
        )}
      </View>
      <T tone="textSub" style={styles.foot}>
        作った日：{formatShort(site.created_at.slice(0, 10))}
      </T>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: Space.s },
  mt: { marginTop: Space.m },
  row: { flexDirection: 'row', gap: Space.s },
  infoRow: { paddingHorizontal: Space.l, paddingVertical: Space.m, gap: 2 },
  infoKey: { fontSize: 14, fontWeight: '700' },
  infoVal: { fontSize: 17, fontWeight: '700', lineHeight: 24 },
  memberRow: { paddingHorizontal: Space.l, paddingVertical: Space.m, gap: Space.s },
  memberHead: { flexDirection: 'row', alignItems: 'center', gap: Space.m },
  memberName: { fontSize: 18, fontWeight: '800' },
  meta: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  memberActions: { flexDirection: 'row', gap: Space.s },
  addBox: { gap: Space.s, marginTop: Space.m },
  addTitle: { fontSize: 17, fontWeight: '800' },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: Space.l, width: '100%', maxWidth: 600, alignSelf: 'center' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 20, fontWeight: '900', flex: 1 },
  close: { width: MinTap, height: MinTap, alignItems: 'center', justifyContent: 'center' },
  foot: { fontSize: 13, fontWeight: '600', marginTop: Space.l, textAlign: 'center' },
});
