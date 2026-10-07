import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CheckRow, ErrorText } from '@/components/form';
import { BackHeader } from '@/components/header';
import { Screen } from '@/components/screen';
import { AnswerChip } from '@/components/site/yotei-tab';
import { BigButton, EmptyState, Hint, Icons, LoadingView, SectionLabel, T } from '@/components/ui';
import { Space } from '@/constants/theme';
import { api } from '@/data/client';
import { useAction, useRequests, useSite } from '@/data/queries';
import { eachDay, formatRange, formatShortDow } from '@/lib/date';

/** 入る人を決める：返事を見ながら、人と日を選んで確定する */
export default function ConfirmScheduleScreen() {
  const { id, requestId } = useLocalSearchParams<{ id: string; requestId: string }>();
  const { data: detail } = useSite(id);
  const requests = useRequests(id);
  const request = requests.data?.find((r) => r.id === requestId);
  const dates = request ? eachDay(request.target_date_from, request.target_date_to) : [];
  const [pickedUsers, setPickedUsers] = useState<string[] | null>(null);
  const [pickedDates, setPickedDates] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { run, busy } = useAction();

  const header = <BackHeader title="入る人を決める" sub={detail?.site.name} />;
  if (!detail || requests.isLoading) {
    return (
      <Screen size="narrow" header={header}>
        <LoadingView />
      </Screen>
    );
  }
  if (!request || request.status !== 'open') {
    return (
      <Screen size="narrow" header={header}>
        <View style={styles.mt}>
          <EmptyState title="この確認はもう締め切られています" action={<BigButton label="戻る" kind="secondary" onPress={() => router.back()} />} />
        </View>
      </Screen>
    );
  }

  const answerOf = (uid: string) => request.replies.find((r) => r.user_id === uid)?.answer;
  // 最初は「入れる」と答えた人を選んでおく
  const users = pickedUsers ?? detail.members.filter((m) => answerOf(m.user_id) === 'yes').map((m) => m.user_id);
  const days = pickedDates ?? dates;
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const submit = async () => {
    if (users.length === 0) return setError('入る人を1人以上選んでください');
    if (days.length === 0) return setError('日にちを1日以上選んでください');
    setError(null);
    const ok = await run(
      () => api.confirmSchedule(request.id, users, [...days].sort()),
      `${users.length}人の予定を決めました。本人に通知が届きます`,
    );
    if (ok !== undefined) router.back();
  };

  return (
    <Screen
      size="narrow"
      header={header}
      footer={
        <>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <BigButton label={`${users.length}人 × ${days.length}日 で決める`} icon={Icons.check} busy={busy} onPress={submit} />
        </>
      }>
      <Hint>{`${formatRange(request.target_date_from, request.target_date_to)}${request.meet_time ? ` ${request.meet_time}集合` : ''}。選んだ人のカレンダーに予定が入り、通知が届きます。この確認は締め切られます。`}</Hint>

      {dates.length > 1 && (
        <>
          <SectionLabel>日にち</SectionLabel>
          <View style={styles.gap}>
            {dates.map((d) => (
              <CheckRow key={d} label={formatShortDow(d)} checked={days.includes(d)} onToggle={() => setPickedDates(toggle(days, d))} />
            ))}
          </View>
        </>
      )}

      <SectionLabel>{`入る人（${users.length}人）`}</SectionLabel>
      <View style={styles.gap}>
        {detail.members.map((m) => (
          <CheckRow
            key={m.user_id}
            label={m.user?.display_name ?? ''}
            sub={m.user?.trade ?? undefined}
            checked={users.includes(m.user_id)}
            onToggle={() => setPickedUsers(toggle(users, m.user_id))}
            right={<AnswerChip answer={answerOf(m.user_id)} />}
          />
        ))}
      </View>
      <T tone="textSub" style={styles.note}>
        「入れん」「未回答」の人も、話がついていれば選べます。
      </T>

    </Screen>
  );
}

const styles = StyleSheet.create({
  mt: { marginTop: Space.l },
  gap: { gap: Space.s },
  note: { fontSize: 14, fontWeight: '600', marginTop: Space.s },
});
