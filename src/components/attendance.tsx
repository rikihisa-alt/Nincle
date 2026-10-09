/**
 * 出面の入力。現場の「出面」タブ、日ごとの画面、ホームのカードで使う。
 * 「1日」「半日」を押して、残業があれば時間を足すだけ。
 */
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton, Chip, Icon, Icons, LoadingView, Stepper, T, FitText } from '@/components/ui';
import { MinTap, Space, useColors } from '@/constants/theme';
import { api } from '@/data/client';
import { saveAttendance } from '@/data/offline';
import { useAttendanceHistory } from '@/data/queries';
import { confirm } from '@/lib/confirm';
import { formatShortDow, formatStamp } from '@/lib/date';
import { toMessage } from '@/lib/errors';
import {
  computeNinku,
  describeAttendance,
  describeOvertimeRule,
  formatNinku,
  formatYen,
  ninkuAmount,
  type DayUnit,
  type OvertimeRule,
} from '@/lib/ninku';
import type { AttendanceRow } from '@/lib/types';
import { useSheetStyle } from '@/lib/layout';
import { useMe } from '@/providers/auth';
import { useToast } from '@/providers/toast';

/** 承認の状態（色だけでなく文字とアイコンで） */
export function ApprovalChip({ approved }: { approved: boolean }) {
  const c = useColors();
  return approved ? (
    <Chip label="承認済み" icon={Icons.check} fg={c.ok} bg={c.okBg} />
  ) : (
    <Chip label="承認待ち" icon={Icons.clock} fg={c.statusSoon} bg={c.statusSoonBg} />
  );
}

function useSaveAttendance() {
  const qc = useQueryClient();
  const toast = useToast();
  const { userId } = useMe();
  const [busy, setBusy] = useState(false);
  const save = async (input: { siteId: string; userId: string; workDate: string; unit: DayUnit; overtimeHours: number }, ninku: number) => {
    setBusy(true);
    try {
      const result = await saveAttendance(input, userId);
      await qc.invalidateQueries();
      toast(
        result === 'queued'
          ? '電波がないので端末に記録しました。つながったら自動で送ります'
          : `出面を入れました（${formatNinku(ninku)}人工）`,
        result === 'queued' ? 'info' : 'ok',
      );
      return true;
    } catch (e) {
      toast(toMessage(e), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { save, busy };
}

/** 出面の入力欄（全部入り） */
export function AttendanceEditor({
  siteId,
  rule,
  targetUserId,
  targetName,
  date,
  existing,
  isAdmin,
  lockedReason,
  unitPrice,
  onDone,
}: {
  siteId: string;
  rule: OvertimeRule;
  targetUserId: string;
  /** 代理入力のとき、誰の分か */
  targetName?: string;
  date: string;
  existing?: AttendanceRow;
  isAdmin: boolean;
  /** 確定済み・アーカイブ済みなど、直せない理由 */
  lockedReason?: string | null;
  unitPrice?: number;
  onDone?: () => void;
}) {
  const c = useColors();
  const toast = useToast();
  const qc = useQueryClient();
  const [unit, setUnit] = useState<DayUnit | null>(existing ? existing.unit : null);
  const [overtime, setOvertime] = useState(existing?.overtime_hours ?? 0);
  const [showHistory, setShowHistory] = useState(false);
  const { save, busy } = useSaveAttendance();
  const preview = unit === null ? null : computeNinku(unit, overtime, rule);
  const approvedLock = existing?.approved_at && !isAdmin ? '承認済みです。直すときは現場の管理者に頼んでください' : null;
  const locked = lockedReason ?? approvedLock;
  const changed = !existing || existing.unit !== unit || existing.overtime_hours !== overtime;

  const submit = async () => {
    if (unit === null || preview === null) return;
    const ok = await save({ siteId, userId: targetUserId, workDate: date, unit, overtimeHours: overtime }, preview);
    if (ok) onDone?.();
  };

  const remove = async () => {
    if (!existing) return;
    if (!(await confirm('この出面を消す', `${formatShortDow(date)}の出面を消します。消した記録は履歴に残ります。`, '消す'))) return;
    try {
      await api.deleteAttendance(existing.id);
      await qc.invalidateQueries();
      toast('出面を消しました', 'ok');
      onDone?.();
    } catch (e) {
      toast(toMessage(e), 'error');
    }
  };

  return (
    <View style={styles.editor}>
      {targetName && (
        <T style={styles.target}>
          {targetName}さんの分（代わりに入れる）
        </T>
      )}
      {existing && (
        <View style={styles.row}>
          <T tone="textSub" style={styles.meta}>
            いま：{describeAttendance(existing.unit, existing.overtime_hours)}（{formatNinku(existing.computed_ninku)}人工）
          </T>
          <ApprovalChip approved={Boolean(existing.approved_at)} />
        </View>
      )}

      {locked ? (
        <View style={[styles.locked, { backgroundColor: c.cardAlt, borderColor: c.border }]}>
          <Icon name={Icons.lock} size={22} color={c.textSub} />
          <T style={styles.lockedText}>{locked}</T>
        </View>
      ) : (
        <>
          <View style={styles.row}>
            <BigButton
              label="1日"
              kind="secondary"
              selected={unit === 1}
              onPress={() => setUnit(1)}
              style={styles.flex}
              accessibilityHint="1人工として入れます"
            />
            <BigButton
              label="半日"
              kind="secondary"
              selected={unit === 0.5}
              onPress={() => setUnit(0.5)}
              style={styles.flex}
              accessibilityHint="0.5人工として入れます"
            />
          </View>
          <View style={[styles.otRow, { borderColor: c.border }]}>
            <T style={styles.otLabel}>残業</T>
            <Stepper value={overtime} onChange={setOvertime} step={0.5} min={0} max={12} unit="時間" label="残業" />
          </View>
          <T tone="textSub" style={styles.rule}>
            この現場は{describeOvertimeRule(rule)}
          </T>
          <View style={[styles.preview, { backgroundColor: c.cardAlt }]}>
            <T tone="textSub" style={styles.previewLabel}>
              この日の人工
            </T>
            <FitText style={styles.previewNum} align="center" boxStyle={styles.previewBox}>{preview === null ? '—' : formatNinku(preview)}</FitText>
            <T tone="textSub" style={styles.previewLabel}>
              人工{preview !== null && unitPrice ? `（${formatYen(ninkuAmount(preview, unitPrice))}円）` : ''}
            </T>
          </View>
          <BigButton
            label={existing ? (changed ? '直して入れる' : '変わっていません') : '出面を入れる'}
            icon={Icons.edit}
            disabled={unit === null || !changed}
            busy={busy}
            onPress={submit}
          />
          {unit === null && (
            <T tone="textSub" style={styles.help}>
              まず「1日」か「半日」を押してください
            </T>
          )}
        </>
      )}

      {existing && (
        <View style={styles.row}>
          <BigButton label="直した記録" icon={Icons.history} kind="ghost" compact onPress={() => setShowHistory(true)} style={styles.flex} />
          {!locked && <BigButton label="消す" icon={Icons.trash} kind="danger" compact onPress={remove} style={styles.flex} />}
        </View>
      )}
      {existing && (
        <AttendanceHistoryModal visible={showHistory} attendance={existing} onClose={() => setShowHistory(false)} />
      )}
    </View>
  );
}

/** ホームの「今日の段取り」に出す、押すだけの出面入力 */
export function QuickAttendance({
  siteId,
  rule,
  date,
  existing,
  locked,
  hideLabel,
}: {
  siteId: string;
  rule: OvertimeRule;
  date: string;
  existing?: AttendanceRow;
  locked?: boolean;
  hideLabel?: boolean;
}) {
  const c = useColors();
  const { userId } = useMe();
  const { save, busy } = useSaveAttendance();
  const goDetail = () => router.push({ pathname: '/site/[id]', params: { id: siteId, tab: 'dezura', date } });

  if (existing) {
    return (
      <View style={[styles.done, { backgroundColor: c.okBg, borderColor: c.ok }]}>
        <Icon name={Icons.check} size={24} color={c.ok} />
        <View style={styles.flex}>
          <T style={styles.doneText}>
            出面：{describeAttendance(existing.unit, existing.overtime_hours)}（{formatNinku(existing.computed_ninku)}人工）
          </T>
          <T tone="textSub" style={styles.meta}>
            {existing.approved_at ? '承認済み' : '承認待ち'}
          </T>
        </View>
        <BigButton label="直す" kind="secondary" compact onPress={goDetail} />
      </View>
    );
  }
  if (locked) return null;
  return (
    <View style={styles.quick}>
      {!hideLabel && <T style={styles.quickLabel}>出面を入れる（押すだけ）</T>}
      <View style={styles.row}>
        <BigButton
          label="1日"
          busy={busy}
          onPress={() => save({ siteId, userId, workDate: date, unit: 1, overtimeHours: 0 }, computeNinku(1, 0, rule))}
          style={styles.flex}
        />
        <BigButton
          label="半日"
          kind="secondary"
          disabled={busy}
          onPress={() => save({ siteId, userId, workDate: date, unit: 0.5, overtimeHours: 0 }, computeNinku(0.5, 0, rule))}
          style={styles.flex}
        />
        <BigButton label="残業" kind="secondary" disabled={busy} onPress={goDetail} style={styles.flex} accessibilityHint="残業の時間を入れる画面を開きます" />
      </View>
    </View>
  );
}

export function AttendanceHistoryModal({
  visible,
  attendance,
  onClose,
}: {
  visible: boolean;
  attendance: AttendanceRow;
  onClose: () => void;
}) {
  const c = useColors();
  const sheet = useSheetStyle();
  const { data, isLoading } = useAttendanceHistory(visible ? attendance.id : null);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, sheet.backdrop, { backgroundColor: c.overlay }]}>
        <SafeAreaView edges={['bottom']} style={[styles.sheet, sheet.sheet, { backgroundColor: c.bg }]}>
          <View style={styles.sheetHeader}>
            <T style={styles.sheetTitle}>{formatShortDow(attendance.work_date)} の直した記録</T>
            <Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={onClose} style={styles.close}>
              <Icon name={Icons.close} size={26} color={c.text} />
            </Pressable>
          </View>
          <T style={styles.histNow}>
            いま：{describeAttendance(attendance.unit, attendance.overtime_hours)}（{formatNinku(attendance.computed_ninku)}人工）
          </T>
          {isLoading ? (
            <LoadingView />
          ) : !data?.length ? (
            <T tone="textSub" style={styles.histEmpty}>
              直した記録はありません
            </T>
          ) : (
            data.map((h) => (
              <View key={h.id} style={[styles.histRow, { borderTopColor: c.border }]}>
                <T tone="textSub" style={styles.meta}>
                  {formatStamp(h.changed_at)} より前
                </T>
                <T style={styles.histText}>
                  {describeAttendance(h.unit, h.overtime_hours)}（{formatNinku(h.computed_ninku)}人工）
                  {h.approved_at ? '・承認済み' : ''}
                  {h.operation === 'delete' ? '　→ 消した' : ''}
                </T>
              </View>
            ))
          )}
          <BigButton label="閉じる" kind="secondary" onPress={onClose} style={styles.mt} />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.s, flexWrap: 'wrap' },
  editor: { gap: Space.m },
  target: { fontSize: 18, fontWeight: '900' },
  meta: { fontSize: 15, fontWeight: '600' },
  locked: { flexDirection: 'row', gap: Space.s, alignItems: 'center', borderWidth: 1, borderRadius: 8, padding: Space.m },
  lockedText: { flex: 1, fontSize: 16, fontWeight: '700', lineHeight: 22 },
  otRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: Space.m },
  otLabel: { fontSize: 18, fontWeight: '800' },
  rule: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  preview: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Space.s, borderRadius: 8, padding: Space.m },
  previewLabel: { fontSize: 16, fontWeight: '700' },
  previewBox: { width: 110 },
  previewNum: { fontSize: 36, fontWeight: '900', fontVariant: ['tabular-nums'] },
  help: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  done: { flexDirection: 'row', alignItems: 'center', gap: Space.s, borderWidth: 1, borderRadius: 8, padding: Space.m },
  doneText: { fontSize: 16, fontWeight: '800' },
  quick: { gap: Space.s, marginTop: Space.xs },
  quickLabel: { fontSize: 15, fontWeight: '800' },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: Space.l, width: '100%', maxWidth: 600, alignSelf: 'center' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 20, fontWeight: '900', flex: 1 },
  close: { width: MinTap, height: MinTap, alignItems: 'center', justifyContent: 'center' },
  histNow: { fontSize: 17, fontWeight: '800', marginVertical: Space.s },
  histEmpty: { fontSize: 16, fontWeight: '700', paddingVertical: Space.l },
  histRow: { borderTopWidth: 1, paddingVertical: Space.m, gap: 2 },
  histText: { fontSize: 17, fontWeight: '700' },
  mt: { marginTop: Space.m },
});
