/** 現場の作成・設定で共通の入力欄 */
import { StyleSheet, View } from 'react-native';

import { DateField } from '@/components/calendar';
import { ChoiceChips, Field, MoneyField } from '@/components/form';
import { T } from '@/components/ui';
import { Space } from '@/constants/theme';
import { describeOvertimeRule, type OvertimeRule } from '@/lib/ninku';

export type SiteFormValue = {
  name: string;
  address: string;
  clientName: string;
  startDate: string | null;
  dueDate: string | null;
  defaultUnitPrice: number | null;
  overtimeRule: OvertimeRule;
  memo: string;
};

type RuleKey = 'h8' | 'h6' | 'h10' | 'f25' | 'f50' | 'none';

const RULES: Record<RuleKey, { label: string; rule: OvertimeRule }> = {
  h8: { label: '8時間で1人工', rule: { kind: 'hourly', hoursPerNinku: 8 } },
  h6: { label: '6時間で1人工', rule: { kind: 'hourly', hoursPerNinku: 6 } },
  h10: { label: '10時間で1人工', rule: { kind: 'hourly', hoursPerNinku: 10 } },
  f25: { label: '残業ありで＋0.25', rule: { kind: 'fixed', addNinku: 0.25 } },
  f50: { label: '残業ありで＋0.5', rule: { kind: 'fixed', addNinku: 0.5 } },
  none: { label: '換算しない', rule: { kind: 'none' } },
};

function ruleKey(rule: OvertimeRule): RuleKey | null {
  const hit = (Object.keys(RULES) as RuleKey[]).find((k) => JSON.stringify(RULES[k].rule) === JSON.stringify(rule));
  return hit ?? null;
}

export function validateSite(v: SiteFormValue): string | null {
  if (!v.name.trim()) return '現場名を入れてください';
  if (!v.startDate) return '着工日を選んでください';
  if (!v.dueDate) return '納期を選んでください';
  if (v.startDate > v.dueDate) return '納期は着工日より後にしてください';
  if (v.defaultUnitPrice === null) return '人工単価を入れてください（あとで変えられます）';
  return null;
}

export function SiteFields({ value, onChange }: { value: SiteFormValue; onChange: (v: SiteFormValue) => void }) {
  const set = <K extends keyof SiteFormValue>(k: K, v: SiteFormValue[K]) => onChange({ ...value, [k]: v });
  return (
    <>
      <Field label="現場名" required value={value.name} onChangeText={(t) => set('name', t)} placeholder="塚本ハイツ 改修" maxLength={60} />
      <Field label="住所" value={value.address} onChangeText={(t) => set('address', t)} placeholder="大阪市淀川区塚本2丁目" hint="入れておくと、押すだけで地図が開きます" />
      <Field label="元請け" value={value.clientName} onChangeText={(t) => set('clientName', t)} placeholder="丸和建設" />
      <View style={styles.row}>
        <View style={styles.flex}>
          <DateField label="着工日" required value={value.startDate} onChange={(d) => set('startDate', d)} />
        </View>
        <View style={styles.flex}>
          <DateField label="納期" required value={value.dueDate} onChange={(d) => set('dueDate', d)} min={value.startDate ?? undefined} />
        </View>
      </View>
      <MoneyField
        label="人工単価（1日あたり・税抜）"
        value={value.defaultUnitPrice}
        onChange={(v) => set('defaultUnitPrice', v)}
        placeholder="20000"
        hint="人によって違うときは、作ったあとで「設定」から一人ずつ変えられます"
      />
      <T style={styles.label}>残業の人工への換算</T>
      <ChoiceChips
        options={Object.keys(RULES) as RuleKey[]}
        labels={Object.fromEntries((Object.keys(RULES) as RuleKey[]).map((k) => [k, RULES[k].label])) as Record<RuleKey, string>}
        value={ruleKey(value.overtimeRule)}
        onChange={(k) => set('overtimeRule', RULES[k].rule)}
      />
      <T tone="textSub" style={styles.hint}>
        いまの設定：{describeOvertimeRule(value.overtimeRule)}
      </T>
      <Field
        label="メモ（駐車場・注意など）"
        value={value.memo}
        onChangeText={(t) => set('memo', t)}
        multiline
        maxLength={1000}
        placeholder="駐車場は裏のコインパーキング。朝は職人用エレベーターを使う"
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: Space.s },
  label: { fontSize: 16, fontWeight: '800', marginTop: Space.l },
  hint: { fontSize: 14, fontWeight: '600', marginTop: Space.xs },
});
