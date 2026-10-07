import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CheckRow, ChoiceChips, ErrorText } from '@/components/form';
import { BackHeader } from '@/components/header';
import { Screen } from '@/components/screen';
import { SiteFields, validateSite, type SiteFormValue } from '@/components/site/site-form';
import { BigButton, EmptyState, Icons, LoadingView, SectionLabel, T } from '@/components/ui';
import { Space } from '@/constants/theme';
import { api } from '@/data/client';
import { useAction, useMyTeams, useTeam } from '@/data/queries';
import { DEFAULT_OVERTIME_RULE } from '@/lib/ninku';
import { addDays, todayJst } from '@/lib/date';
import { useMe } from '@/providers/auth';

/** 現場を作る：工期・単価を入れて、チームから入ってもらう人を選ぶ */
export default function NewSiteScreen() {
  const { userId } = useMe();
  const teams = useMyTeams();
  const [teamId, setTeamId] = useState<string | null>(null);
  const currentTeamId = teamId ?? teams.data?.[0]?.id ?? null;
  const team = useTeam(currentTeamId);
  const today = todayJst();
  const [value, setValue] = useState<SiteFormValue>({
    name: '',
    address: '',
    clientName: '',
    startDate: today,
    dueDate: addDays(today, 30),
    defaultUnitPrice: null,
    overtimeRule: DEFAULT_OVERTIME_RULE,
    memo: '',
  });
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { run, busy } = useAction();

  const submit = async () => {
    const problem = validateSite(value);
    if (problem || !currentTeamId) {
      setError(problem ?? 'チームを選んでください');
      return;
    }
    setError(null);
    const id = await run(
      () =>
        api.createSite({
          teamId: currentTeamId,
          name: value.name.trim(),
          address: value.address.trim(),
          clientName: value.clientName.trim(),
          startDate: value.startDate!,
          dueDate: value.dueDate!,
          defaultUnitPrice: value.defaultUnitPrice!,
          overtimeRule: value.overtimeRule,
          memo: value.memo.trim(),
          memberIds,
        }),
      '現場を作りました',
    );
    if (id) router.replace({ pathname: '/site/[id]', params: { id } });
  };

  const header = <BackHeader title="現場を作る" />;

  if (teams.isLoading) {
    return (
      <Screen size="narrow" header={header}>
        <LoadingView />
      </Screen>
    );
  }
  if (!teams.data?.length) {
    return (
      <Screen size="narrow" header={header}>
        <View style={styles.mt}>
          <EmptyState
            title="先にチームを作ってください"
            body="現場には、チームの仲間から入ってもらう人を選びます。チームを作って仲間を招待してから、現場を作ります。"
            action={<BigButton label="チームを作る" icon={Icons.people} onPress={() => router.replace('/team')} />}
          />
        </View>
      </Screen>
    );
  }

  const others = (team.data?.members ?? []).filter((m) => m.user_id !== userId);

  return (
    <Screen
      size="narrow"
      header={header}
      footer={
        <>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <BigButton label="この内容で現場を作る" icon={Icons.check} busy={busy} onPress={submit} />
        </>
      }>
      {teams.data.length > 1 && (
        <>
          <SectionLabel>どのチームの現場？</SectionLabel>
          <ChoiceChips
            options={teams.data.map((t) => t.id)}
            labels={Object.fromEntries(teams.data.map((t) => [t.id, t.name]))}
            value={currentTeamId}
            onChange={(id) => {
              setTeamId(id);
              setMemberIds([]);
            }}
          />
        </>
      )}

      <SiteFields value={value} onChange={setValue} />

      <SectionLabel>入ってもらう人</SectionLabel>
      <T tone="textSub" style={styles.help}>
        あなたは管理者として自動で入ります。あとから足したり外したりもできます。
      </T>
      {team.isLoading ? (
        <LoadingView />
      ) : others.length === 0 ? (
        <EmptyState
          title="チームにまだ仲間がいません"
          body="このまま作って、あとで仲間を招待してから現場に入れることもできます。"
        />
      ) : (
        <View style={styles.gap}>
          <BigButton
            label={memberIds.length === others.length ? '全員はずす' : '全員えらぶ'}
            kind="ghost"
            compact
            onPress={() => setMemberIds(memberIds.length === others.length ? [] : others.map((m) => m.user_id))}
          />
          {others.map((m) => (
            <CheckRow
              key={m.user_id}
              label={m.user?.display_name ?? '（名前なし）'}
              sub={m.user?.trade ?? undefined}
              checked={memberIds.includes(m.user_id)}
              onToggle={() =>
                setMemberIds(memberIds.includes(m.user_id) ? memberIds.filter((x) => x !== m.user_id) : [...memberIds, m.user_id])
              }
            />
          ))}
        </View>
      )}

    </Screen>
  );
}

const styles = StyleSheet.create({
  mt: { marginTop: Space.l },
  gap: { gap: Space.s },
  help: { fontSize: 15, fontWeight: '600', marginBottom: Space.s },
});
