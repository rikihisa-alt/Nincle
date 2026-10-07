import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DateField } from '@/components/calendar';
import { CheckRow, ErrorText } from '@/components/form';
import { BackHeader } from '@/components/header';
import { Screen } from '@/components/screen';
import { BigButton, Hint, Icons, LoadingView, SectionLabel } from '@/components/ui';
import { Space } from '@/constants/theme';
import { api } from '@/data/client';
import { useAction, useSite } from '@/data/queries';
import { addDays, formatShortDow, todayJst } from '@/lib/date';

/** 聞かずに予定を入れる（電話で話がついているときなど） */
export default function AssignScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: detail } = useSite(id);
  const [date, setDate] = useState<string | null>(addDays(todayJst(), 1));
  const [users, setUsers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { run, busy } = useAction();

  const submit = async () => {
    if (!date) return setError('日にちを選んでください');
    if (users.length === 0) return setError('入る人を1人以上選んでください');
    setError(null);
    const ok = await run(async () => {
      for (const uid of users) await api.addAssignment(id, uid, date);
      return true;
    }, `${formatShortDow(date)}に${users.length}人の予定を入れました`);
    if (ok) router.back();
  };

  return (
    <Screen
      size="narrow"
      header={<BackHeader title="予定を入れる" sub={detail?.site.name} />}
      footer={
        <>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <BigButton
            label={date ? `${formatShortDow(date)}に${users.length}人を入れる` : '予定を入れる'}
            icon={Icons.check}
            busy={busy}
            onPress={submit}
          />
        </>
      }>
      <Hint>電話などで話がついているときに使います。メンバーのカレンダーにすぐ入ります。</Hint>
      <DateField label="日にち" required value={date} onChange={setDate} />
      <SectionLabel>入る人</SectionLabel>
      {!detail ? (
        <LoadingView />
      ) : (
        <View style={styles.gap}>
          {detail.members.map((m) => (
            <CheckRow
              key={m.user_id}
              label={m.user?.display_name ?? ''}
              sub={m.user?.trade ?? undefined}
              checked={users.includes(m.user_id)}
              onToggle={() => setUsers(users.includes(m.user_id) ? users.filter((x) => x !== m.user_id) : [...users, m.user_id])}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: Space.s },
});
