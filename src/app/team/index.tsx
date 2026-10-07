import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorText, Field } from '@/components/form';
import { BackHeader } from '@/components/header';
import { Screen } from '@/components/screen';
import { BigButton, Chip, ErrorView, Hint, Icon, Icons, LoadingView, SectionLabel, T, Tanzaku } from '@/components/ui';
import { Space, useColors } from '@/constants/theme';
import { api } from '@/data/client';
import { useAction, useMyTeams } from '@/data/queries';
import { extractInviteToken } from '@/lib/invite';
import { closingDayLabel } from '@/lib/period';

/** チーム一覧：入っているチーム、チーム作成、招待コードで参加 */
export default function TeamListScreen() {
  const c = useColors();
  const teams = useMyTeams();
  const [newName, setNewName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { run, busy } = useAction();

  const create = async () => {
    if (!newName.trim()) return setError('チーム名を入れてください');
    setError(null);
    const id = await run(() => api.createTeam(newName.trim()), 'チームを作りました。次は仲間を招待しましょう');
    if (id) {
      setNewName('');
      router.push({ pathname: '/team/[id]', params: { id } });
    }
  };

  const join = () => {
    const token = extractInviteToken(code);
    if (!token) return setError('招待コードを確かめてください');
    setError(null);
    setCode('');
    router.push({ pathname: '/invite/[token]', params: { token } });
  };

  return (
    <Screen size="narrow" header={<BackHeader title="チーム" sub="いつもの仲間の名簿" />} onRefresh={() => teams.refetch()}>
      <SectionLabel>入っているチーム</SectionLabel>
      {teams.error ? (
        <ErrorView message="読み込めませんでした" onRetry={() => void teams.refetch()} />
      ) : teams.isLoading ? (
        <LoadingView />
      ) : !teams.data?.length ? (
        <Hint>まだチームがありません。親方ならチームを作り、仲間なら親方からもらった招待リンクを開くか、招待コードを入れてください。</Hint>
      ) : (
        <View style={styles.list}>
          {teams.data.map((t) => (
            <Tanzaku
              key={t.id}
              stripe={t.myRole === 'owner' ? c.accent : c.statusActive}
              onPress={() => router.push({ pathname: '/team/[id]', params: { id: t.id } })}
              accessibilityLabel={`${t.name}、${t.memberCount}人`}>
              <View style={styles.row}>
                <T style={styles.teamName}>{t.name}</T>
                <Icon name={Icons.chevron} size={20} color={c.textSub} />
              </View>
              <View style={styles.chips}>
                <Chip label={`${t.memberCount}人`} icon={Icons.people} fg={c.textSub} bg={c.card} />
                <Chip label={closingDayLabel(t.closing_day)} icon={Icons.calendar} fg={c.textSub} bg={c.card} />
                {t.myRole === 'owner' && <Chip label="親方" icon={Icons.crown} fg={c.text} bg={c.cardAlt} />}
              </View>
            </Tanzaku>
          ))}
        </View>
      )}

      <SectionLabel>チームを作る（親方）</SectionLabel>
      <Field label="チーム名" value={newName} onChangeText={setNewName} placeholder="塚本組" maxLength={40} />
      <BigButton label="チームを作る" icon={Icons.add} busy={busy} disabled={!newName.trim()} onPress={create} style={styles.mt} />

      <SectionLabel>招待コードで入る（仲間）</SectionLabel>
      <Field
        label="招待コード（リンクごと貼っても大丈夫）"
        value={code}
        onChangeText={setCode}
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={join}
      />
      <BigButton label="このコードで入る" kind="secondary" disabled={!code.trim()} onPress={join} style={styles.mt} />
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: Space.s },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Space.s },
  teamName: { fontSize: 20, fontWeight: '900', flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.s },
  mt: { marginTop: Space.m },
});
