import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DateField } from '@/components/calendar';
import { ChoiceChips, ErrorText, Field } from '@/components/form';
import { BackHeader } from '@/components/header';
import { Screen } from '@/components/screen';
import { BigButton, Card, Chip, Hint, Icons, ListRow, LoadingView, SectionLabel, Segmented, T } from '@/components/ui';
import { Space, useColors } from '@/constants/theme';
import { api } from '@/data/client';
import { useAction, useBusyDays, useSite } from '@/data/queries';
import { addDays, daysBetween, formatRange, formatShortDow, todayJst } from '@/lib/date';
import { useMe } from '@/providers/auth';

const TIMES = ['7:00', '7:30', '8:00', '8:30', '9:00', '13:00'] as const;
const NOTES = ['入れる人おる？', '応援お願いします', '雨なら中止です', '道具は各自で'] as const;

/** 予定の確認を出す：日にちと集合時間を決めて、メンバーに「入れる？」と聞く */
export default function NewRequestScreen() {
  const { id, date } = useLocalSearchParams<{ id: string; date?: string }>();
  const c = useColors();
  const { userId } = useMe();
  const { data: detail } = useSite(id);
  const today = todayJst();
  const [mode, setMode] = useState<'single' | 'range'>('single');
  // 仲間の空きから来たときは、選んだ日にちを入れておく
  const [from, setFrom] = useState<string | null>(date && date >= today ? date : addDays(today, 1));
  const [to, setTo] = useState<string | null>(addDays(today, 2));
  const [time, setTime] = useState<string | null>('8:00');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { run, busy } = useAction();

  const end = mode === 'single' ? from : to;
  const busyDays = useBusyDays(detail?.team.id, { from: from ?? today, to: end ?? from ?? today });

  const submit = async () => {
    if (!from || !end) return setError('日にちを選んでください');
    if (end < from) return setError('終わりの日は、始まりの日より後にしてください');
    if (daysBetween(from, end) > 30) return setError('一度に聞けるのは31日までです');
    setError(null);
    const ok = await run(
      () => api.createRequest(userId, { siteId: id, from, to: end, meetTime: time ?? '', note: note.trim() }),
      'メンバーに確認を送りました',
    );
    if (ok) router.back();
  };

  const members = (detail?.members ?? []).filter((m) => m.user_id !== userId);
  const busyOf = (uid: string) => (busyDays.data ?? []).filter((b) => b.user_id === uid).map((b) => b.work_date).sort();

  return (
    <Screen
      size="narrow"
      header={<BackHeader title="入れるか聞く" sub={detail?.site.name} />}
      footer={
        <>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <BigButton
            label={from && end ? `${formatRange(from, end)} で聞く` : 'この内容で聞く'}
            icon={Icons.send}
            busy={busy}
            onPress={submit}
          />
        </>
      }>
      <Hint>メンバー全員に「入れる？」と通知が届きます。返事が集まったら、入る人を決めてください。</Hint>

      <SectionLabel>日にち</SectionLabel>
      <Segmented
        options={[
          { key: 'single', label: '1日だけ' },
          { key: 'range', label: '何日か続けて' },
        ]}
        value={mode}
        onChange={setMode}
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <DateField label={mode === 'single' ? '日にち' : '始まり'} required value={from} onChange={setFrom} min={today} />
        </View>
        {mode === 'range' && (
          <View style={styles.flex}>
            <DateField label="終わり" required value={to} onChange={setTo} min={from ?? today} />
          </View>
        )}
      </View>

      <SectionLabel>集合時間</SectionLabel>
      <ChoiceChips options={TIMES} value={time as (typeof TIMES)[number] | null} onChange={setTime} />
      <Field label="ほかの時間" value={time && !(TIMES as readonly string[]).includes(time) ? time : ''} onChangeText={(t) => setTime(t || null)} placeholder="6:45" maxLength={10} />

      <SectionLabel>ひとこと</SectionLabel>
      <ChoiceChips options={NOTES} value={null} onChange={(n) => setNote(note ? `${note} ${n}` : n)} />
      <Field label="内容" value={note} onChangeText={setNote} multiline maxLength={1000} placeholder="配管が1日ずれたんで、ボード貼りを回します。入れる人おる？" />

      <SectionLabel>{from && end ? `仲間の予定（${formatRange(from, end)}）` : '仲間の予定'}</SectionLabel>
      {busyDays.isLoading ? (
        <LoadingView />
      ) : (
        <Card>
          {members.map((m, i) => {
            const b = busyOf(m.user_id);
            return (
              <ListRow
                key={m.user_id}
                first={i === 0}
                title={m.user?.display_name ?? ''}
                sub={b.length ? `予定あり：${b.map(formatShortDow).join('・')}` : m.user?.trade ?? null}
                right={
                  b.length ? (
                    <Chip label="予定あり" icon={Icons.calendar} fg={c.statusSoon} bg={c.statusSoonBg} />
                  ) : (
                    <Chip label="空き" icon={Icons.check} fg={c.ok} bg={c.okBg} />
                  )
                }
              />
            );
          })}
        </Card>
      )}
      <T tone="textSub" style={styles.note}>
        「空きを仲間に見せない」にしている人は、空きと表示されることがあります。
      </T>

    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: Space.s },
  note: { fontSize: 14, fontWeight: '600', marginTop: Space.s },
});
