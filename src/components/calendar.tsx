/**
 * 月カレンダーと日付選び。
 * 端末ごとに違う日付ピッカーではなく、大きなマスのカレンダーを共通で使う（年配の方でも押し間違えにくい）。
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton, Icon, Icons, T } from '@/components/ui';
import { MinTap, Space, useColors } from '@/constants/theme';
import { formatLong, formatMonth, monthGrid, monthKey, shiftMonth, todayJst } from '@/lib/date';
import { useSheetStyle } from '@/lib/layout';

export type DayMark = { color: string; label: string };

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

export function MonthCalendar({
  month,
  onMonthChange,
  marks,
  selected,
  rangeEnd,
  onSelect,
  min,
  max,
  dimmed,
}: {
  month: string;
  onMonthChange: (m: string) => void;
  marks?: Record<string, DayMark[]>;
  selected?: string | null;
  /** 期間選びのときの終わり */
  rangeEnd?: string | null;
  onSelect?: (ymd: string) => void;
  min?: string;
  max?: string;
  /** 薄く出す日（例：仲間の予定が埋まっている日） */
  dimmed?: Set<string>;
}) {
  const c = useColors();
  const today = todayJst();
  const weeks = monthGrid(month);
  const inRange = (d: string) => selected && rangeEnd && d >= selected && d <= rangeEnd;

  return (
    <View>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="前の月"
          onPress={() => onMonthChange(shiftMonth(month, -1))}
          style={[styles.navBtn, { borderColor: c.border, backgroundColor: c.cardAlt }]}>
          <Icon name={Icons.chevronLeft} size={26} color={c.text} />
        </Pressable>
        <T style={styles.month} accessibilityRole="header">
          {formatMonth(month)}
        </T>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="次の月"
          onPress={() => onMonthChange(shiftMonth(month, 1))}
          style={[styles.navBtn, { borderColor: c.border, backgroundColor: c.cardAlt }]}>
          <Icon name={Icons.chevron} size={26} color={c.text} />
        </Pressable>
      </View>
      {month !== monthKey(today) && (
        <Pressable accessibilityRole="button" onPress={() => onMonthChange(monthKey(today))} style={styles.todayLink}>
          <T style={[styles.todayLinkText, { color: c.info }]}>今月に戻る</T>
        </Pressable>
      )}
      <View style={styles.dowRow}>
        {DOW.map((d, i) => (
          <T
            key={d}
            style={[styles.dow, { color: i === 0 ? c.statusOver : i === 6 ? c.info : c.textSub }]}
            importantForAccessibility="no">
            {d}
          </T>
        ))}
      </View>
      {weeks.map((w, wi) => (
        <View key={wi} style={styles.week}>
          {w.map((d, i) => {
            if (!d) return <View key={i} style={styles.cell} />;
            const disabled = (min && d < min) || (max && d > max);
            const isSel = d === selected || d === rangeEnd;
            const isToday = d === today;
            const dayMarks = marks?.[d] ?? [];
            const label = `${formatLong(d)}${isToday ? '、今日' : ''}${dayMarks.length ? '、' + dayMarks.map((m) => m.label).join('、') : ''}`;
            return (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: isSel, disabled: Boolean(disabled) }}
                disabled={Boolean(disabled) || !onSelect}
                onPress={() => onSelect?.(d)}
                style={({ pressed }) => [
                  styles.cell,
                  styles.dayCell,
                  { borderColor: isToday ? c.text : 'transparent' },
                  inRange(d) && { backgroundColor: c.cardAlt },
                  isSel && { backgroundColor: c.accent },
                  dimmed?.has(d) && !isSel && { opacity: 0.45 },
                  disabled && { opacity: 0.3 },
                  pressed && { opacity: 0.6 },
                ]}>
                <T
                  style={[
                    styles.dayNum,
                    { color: isSel ? c.onAccent : i === 0 ? c.statusOver : i === 6 ? c.info : c.text },
                    isToday && styles.todayNum,
                  ]}>
                  {Number(d.slice(8, 10))}
                </T>
                <View style={styles.marks}>
                  {dayMarks.slice(0, 3).map((m, mi) => (
                    <View key={mi} style={[styles.mark, { backgroundColor: m.color }]} />
                  ))}
                </View>
                {dayMarks.length > 3 && (
                  <T style={[styles.more, { color: isSel ? c.onAccent : c.textSub }]}>+{dayMarks.length - 3}</T>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** 日付の入力欄。押すとカレンダーが開く */
export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  required,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <T style={styles.label}>{label}</T>
        {required && <T style={[styles.required, { color: c.statusOver, borderColor: c.statusOver }]}>必須</T>}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}、${value ? formatLong(value) : '未選択'}。押すとカレンダーが開きます`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.dateBtn, { borderColor: c.border, backgroundColor: c.card }, pressed && { opacity: 0.7 }]}>
        <Icon name={Icons.calendar} size={24} color={c.text} />
        <T style={[styles.dateText, !value && { color: c.textSub }]}>{value ? formatLong(value) : '日付を選ぶ'}</T>
      </Pressable>
      <DatePickerModal
        visible={open}
        title={label}
        initial={value}
        min={min}
        max={max}
        onClose={() => setOpen(false)}
        onPick={(d) => {
          onChange(d);
          setOpen(false);
        }}
      />
    </View>
  );
}

export function DatePickerModal({
  visible,
  title,
  initial,
  min,
  max,
  onClose,
  onPick,
}: {
  visible: boolean;
  title: string;
  initial: string | null;
  min?: string;
  max?: string;
  onClose: () => void;
  onPick: (ymd: string) => void;
}) {
  const c = useColors();
  const sheet = useSheetStyle();
  const [month, setMonth] = useState(monthKey(initial ?? todayJst()));
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, sheet.backdrop, { backgroundColor: c.overlay }]}>
        <SafeAreaView edges={['bottom']} style={[styles.sheet, sheet.sheet, { backgroundColor: c.bg }]}>
          <View style={styles.sheetHeader}>
            <T style={styles.sheetTitle}>{title}</T>
            <Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={onClose} style={styles.close}>
              <Icon name={Icons.close} size={26} color={c.text} />
            </Pressable>
          </View>
          <MonthCalendar month={month} onMonthChange={setMonth} selected={initial} onSelect={onPick} min={min} max={max} />
          <BigButton label="今日にする" kind="secondary" onPress={() => onPick(todayJst())} style={styles.mt} />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Space.s },
  navBtn: { width: MinTap, height: 48, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  month: { fontSize: 22, fontWeight: '900' },
  todayLink: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: Space.m, marginBottom: Space.xs },
  todayLinkText: { fontSize: 15, fontWeight: '800', textDecorationLine: 'underline' },
  dowRow: { flexDirection: 'row' },
  dow: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '800', paddingVertical: 4 },
  week: { flexDirection: 'row' },
  cell: { flex: 1, minHeight: 62, margin: 1 },
  dayCell: { borderRadius: 8, borderWidth: 2, alignItems: 'center', paddingTop: 4 },
  dayNum: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  todayNum: { fontWeight: '900', textDecorationLine: 'underline' },
  marks: { alignSelf: 'stretch', gap: 2, marginTop: 4, paddingHorizontal: 4 },
  mark: { height: 6, borderRadius: 3 },
  more: { fontSize: 11, fontWeight: '800' },
  field: { gap: Space.xs, marginTop: Space.l },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: Space.s },
  label: { fontSize: 16, fontWeight: '800' },
  required: { fontSize: 12, fontWeight: '900', borderWidth: 1, borderRadius: 4, paddingHorizontal: 4 },
  dateBtn: {
    minHeight: MinTap,
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: Space.m,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s,
  },
  dateText: { fontSize: 19, fontWeight: '800' },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: Space.l,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Space.s },
  sheetTitle: { fontSize: 20, fontWeight: '900' },
  close: { width: MinTap, height: MinTap, alignItems: 'center', justifyContent: 'center', marginRight: -Space.s },
  mt: { marginTop: Space.m },
});
