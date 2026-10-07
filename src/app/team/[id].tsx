import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Share, StyleSheet, View } from 'react-native';

import { ChoiceChips, Field } from '@/components/form';
import { BackHeader } from '@/components/header';
import { Screen } from '@/components/screen';
import { Avatar, BigButton, Card, Chip, EmptyState, ErrorView, Hint, Icons, LoadingView, SectionLabel, T } from '@/components/ui';
import { Space, useColors } from '@/constants/theme';
import type { TeamMember } from '@/data/api';
import { api } from '@/data/client';
import { useAction, useTeam } from '@/data/queries';
import { confirm } from '@/lib/confirm';
import { inviteMessage } from '@/lib/invite';
import { closingDayLabel } from '@/lib/period';
import { useMe } from '@/providers/auth';
import { useToast } from '@/providers/toast';

type Closing = 'end' | '15' | '20' | '25';
const CLOSING_LABEL: Record<Closing, string> = { end: '月末', '15': '15日', '20': '20日', '25': '25日' };

/** チームの名簿。親方は招待・メンバー削除・締め日・名前変更・親方交代・チーム削除ができる */
export default function TeamDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const toast = useToast();
  const { userId } = useMe();
  const { data, isLoading, error, refetch } = useTeam(id);
  const { run, busy } = useAction();
  const [lastInvite, setLastInvite] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);

  const team = data?.team;
  const members = data?.members ?? [];
  const isOwner = team?.owner_user_id === userId;
  const header = <BackHeader title={team?.name ?? 'チーム'} sub={team ? `${members.length}人・${closingDayLabel(team.closing_day)}` : null} />;

  if (error) {
    return (
      <Screen size="narrow" header={header}>
        <ErrorView message="読み込めませんでした" onRetry={() => void refetch()} />
      </Screen>
    );
  }
  if (isLoading) {
    return (
      <Screen size="narrow" header={header}>
        <LoadingView />
      </Screen>
    );
  }
  if (!team) {
    return (
      <Screen size="narrow" header={header}>
        <View style={styles.mtl}>
          <EmptyState title="このチームは見られません" body="抜けたか、消されたかもしれません。" />
        </View>
      </Screen>
    );
  }

  const sendInvite = async () => {
    const token = await run(() => api.createInvite(team.id, userId));
    if (!token) return;
    setLastInvite(token);
    try {
      await Share.share({ message: inviteMessage(team.name, token) });
    } catch {
      // 共有をやめても、コードは画面に残っている
    }
  };

  const kick = async (m: TeamMember) => {
    const name = m.user?.display_name || 'この人';
    if (!(await confirm(`${name}さんをチームから外す`, '外しても、これまでの現場の記録は残ります。', '外す'))) return;
    await run(() => api.removeTeamMember(team.id, m.user_id), `${name}さんを外しました`);
  };

  const leave = async () => {
    if (!(await confirm(`「${team.name}」を抜ける`, 'もう一度入るには招待リンクが要ります。', '抜ける'))) return;
    const ok = await run(async () => {
      await api.removeTeamMember(team.id, userId);
      return true;
    }, 'チームを抜けました');
    if (ok) router.back();
  };

  const transfer = async (m: TeamMember) => {
    const name = m.user?.display_name ?? '';
    if (!(await confirm(`${name}さんを親方にする`, `チームの親方（招待・締め・名簿の管理）を${name}さんに渡します。あなたはメンバーになります。`, '渡す'))) return;
    await run(() => api.transferOwnership(team.id, m.user_id), `${name}さんを親方にしました`);
    setTransferring(false);
  };

  const remove = async () => {
    if (!(await confirm(`「${team.name}」を消す`, 'チームの名簿・現場・出面がすべて消えます。元に戻せません。先にCSVを書き出しておくことをおすすめします。', '消す'))) return;
    const ok = await run(async () => {
      await api.deleteTeam(team.id);
      return true;
    }, 'チームを消しました');
    if (ok) router.back();
  };

  const closingValue: Closing = team.closing_day === null ? 'end' : (String(team.closing_day) as Closing);

  return (
    <Screen size="narrow" header={header} onRefresh={() => refetch()}>
      {isOwner && (
        <>
          <SectionLabel>仲間を招待する</SectionLabel>
          <BigButton label="招待リンクを送る（LINE・SMSなど）" icon={Icons.send} busy={busy} onPress={sendInvite} />
          {lastInvite && (
            <View style={[styles.codeBox, { backgroundColor: c.card, borderColor: c.border }]}>
              <T tone="textSub" style={styles.meta}>
                招待コード（14日間使えます）
              </T>
              <T style={styles.code} selectable>
                {lastInvite}
              </T>
              <BigButton
                label="コードをコピー"
                icon={Icons.copy}
                kind="secondary"
                compact
                onPress={async () => {
                  await Clipboard.setStringAsync(lastInvite);
                  toast('コピーしました', 'ok');
                }}
              />
            </View>
          )}
        </>
      )}

      <SectionLabel>{`名簿（${members.length}人）`}</SectionLabel>
      <Card>
        {members.map((m, i) => (
          <View key={m.user_id} style={[styles.member, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
            <View style={styles.memberHead}>
              <Avatar name={m.user?.display_name ?? '？'} size={44} />
              <View style={styles.flex}>
                <T style={styles.name}>
                  {m.user?.display_name || '（名前なし）'}
                  {m.user_id === userId ? '（自分）' : ''}
                </T>
                <T tone="textSub" style={styles.meta}>
                  {[m.user?.trade, m.user?.phone].filter(Boolean).join(' ／ ')}
                </T>
              </View>
              {m.role === 'owner' && <Chip label="親方" icon={Icons.crown} fg={c.text} bg={c.cardAlt} />}
            </View>
            {(m.user?.phone || (isOwner && m.role !== 'owner')) && (
              <View style={styles.actions}>
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
                {isOwner && m.role !== 'owner' && transferring && (
                  <BigButton label="親方にする" icon={Icons.crown} compact onPress={() => transfer(m)} style={styles.flex} />
                )}
                {isOwner && m.role !== 'owner' && !transferring && (
                  <BigButton label="外す" kind="danger" compact onPress={() => kick(m)} style={styles.flex} />
                )}
              </View>
            )}
          </View>
        ))}
      </Card>

      {isOwner ? (
        <>
          <SectionLabel>{`締め日（いまは${closingDayLabel(team.closing_day)}）`}</SectionLabel>
          <ChoiceChips<Closing>
            options={['end', '15', '20', '25']}
            labels={CLOSING_LABEL}
            value={closingValue}
            onChange={(v) =>
              run(
                () => api.updateTeam(team.id, { closing_day: v === 'end' ? null : Number(v) }),
                `${v === 'end' ? '月末' : `${v}日`}締めにしました`,
              )
            }
          />
          <T tone="textSub" style={styles.meta}>
            人工集計の「◯月分」の区切りになります。20日締めなら、10月分は9/21〜10/20です。
          </T>

          <SectionLabel>チームの設定</SectionLabel>
          <View style={styles.gap}>
            {renaming === null ? (
              <BigButton label="チーム名を変える" kind="secondary" icon={Icons.edit} onPress={() => setRenaming(team.name)} />
            ) : (
              <>
                <Field label="新しいチーム名" value={renaming} onChangeText={setRenaming} maxLength={40} autoFocus />
                <View style={styles.row}>
                  <BigButton label="やめる" kind="ghost" onPress={() => setRenaming(null)} style={styles.flex} />
                  <BigButton
                    label="変える"
                    disabled={!renaming.trim()}
                    onPress={async () => {
                      await run(() => api.updateTeam(team.id, { name: renaming.trim() }), 'チーム名を変えました');
                      setRenaming(null);
                    }}
                    style={styles.flex}
                  />
                </View>
              </>
            )}
            {members.length > 1 && (
              <BigButton
                label={transferring ? '親方を渡すのをやめる' : '親方を誰かに渡す'}
                icon={Icons.crown}
                kind="secondary"
                onPress={() => setTransferring(!transferring)}
              />
            )}
            {transferring && <Hint>名簿で「親方にする」を押した人に、親方を渡します。</Hint>}
            <BigButton label="チームを消す" icon={Icons.trash} kind="danger" compact onPress={remove} />
          </View>
        </>
      ) : (
        <BigButton label="このチームを抜ける" kind="danger" compact onPress={leave} style={styles.mtl} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: Space.s },
  row: { flexDirection: 'row', gap: Space.s },
  mtl: { marginTop: Space.xl },
  codeBox: { borderWidth: 1, borderRadius: 8, padding: Space.m, gap: Space.s, marginTop: Space.s },
  code: { fontSize: 24, fontWeight: '900', letterSpacing: 2 },
  member: { paddingHorizontal: Space.l, paddingVertical: Space.m, gap: Space.s },
  memberHead: { flexDirection: 'row', alignItems: 'center', gap: Space.m },
  name: { fontSize: 18, fontWeight: '800' },
  meta: { fontSize: 14, fontWeight: '600', marginTop: 2, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: Space.s },
});
