import { Pressable, StyleSheet, Switch, TextInput, View, type TextInputProps } from 'react-native';

import { T } from '@/components/ui';
import { fontFor } from '@/constants/fonts';
import { MinTap, Space, useColors } from '@/constants/theme';
import { usePrefs } from '@/providers/prefs';

/** 手袋でも押しやすい大きめの入力欄 */
export function Field({
  label,
  hint,
  required,
  ...props
}: TextInputProps & { label: string; hint?: string; required?: boolean }) {
  const c = useColors();
  const { scale } = usePrefs();
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <T style={styles.label}>{label}</T>
        {required && (
          <T style={[styles.required, { color: c.statusOver, borderColor: c.statusOver }]}>必須</T>
        )}
      </View>
      <TextInput
        placeholderTextColor={c.textSub}
        accessibilityLabel={label}
        maxFontSizeMultiplier={1.6}
        {...props}
        style={[
          styles.input,
          { color: c.text, backgroundColor: c.card, borderColor: c.border, fontSize: 19 * scale },
          fontFor('body', 400),
          props.multiline && styles.multiline,
          props.style,
        ]}
      />
      {hint && (
        <T tone="textSub" style={styles.hint}>
          {hint}
        </T>
      )}
    </View>
  );
}

/** 金額（円）。数字以外は入らない */
export function MoneyField({
  label,
  value,
  onChange,
  hint,
  placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  hint?: string;
  placeholder?: string;
}) {
  const c = useColors();
  const { scale } = usePrefs();
  return (
    <View style={styles.field}>
      <T style={styles.label}>{label}</T>
      <View style={[styles.moneyRow, { backgroundColor: c.card, borderColor: c.border }]}>
        <TextInput
          accessibilityLabel={`${label}（円）`}
          value={value === null ? '' : String(value)}
          onChangeText={(t) => {
            const digits = t.replace(/[^\d]/g, '');
            onChange(digits ? Math.min(Number(digits), 9999999) : null);
          }}
          keyboardType="number-pad"
          placeholder={placeholder}
          placeholderTextColor={c.textSub}
          maxFontSizeMultiplier={1.6}
          style={[styles.moneyInput, fontFor('number', 700), { color: c.text, fontSize: 22 * scale }]}
        />
        <T tone="textSub" style={styles.yen}>
          円
        </T>
      </View>
      {hint && (
        <T tone="textSub" style={styles.hint}>
          {hint}
        </T>
      )}
    </View>
  );
}

/** 選択肢をボタンで並べる（職種・時刻など） */
export function ChoiceChips<V extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly V[];
  value: V | null;
  onChange: (v: V) => void;
  labels?: Partial<Record<V, string>>;
}) {
  const c = useColors();
  return (
    <View style={styles.chips} accessibilityRole="radiogroup">
      {options.map((o) => {
        const selected = o === value;
        return (
          <Pressable
            key={o}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(o)}
            style={({ pressed }) => [
              styles.chip,
              { borderColor: selected ? c.onAccent : c.border, backgroundColor: selected ? c.accent : c.card },
              pressed && { opacity: 0.7 },
            ]}>
            <T style={[styles.chipText, { color: selected ? c.onAccent : c.text }]}>{labels?.[o] ?? o}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** チェックボックスの並び（メンバー選びなど） */
export function CheckRow({
  label,
  sub,
  checked,
  onToggle,
  right,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  onToggle: () => void;
  right?: React.ReactNode;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={[label, sub].filter(Boolean).join('、')}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.checkRow,
        { borderColor: checked ? c.text : c.border, backgroundColor: checked ? c.cardAlt : c.card },
        pressed && { opacity: 0.7 },
      ]}>
      <View
        style={[
          styles.box,
          { borderColor: checked ? c.onAccent : c.border, backgroundColor: checked ? c.accent : 'transparent' },
        ]}>
        {checked && <T style={[styles.boxMark, { color: c.onAccent }]}>✓</T>}
      </View>
      <View style={styles.flex}>
        <T style={styles.checkLabel}>{label}</T>
        {sub ? (
          <T tone="textSub" style={styles.checkSub}>
            {sub}
          </T>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

export function ToggleRow({
  label,
  sub,
  value,
  onChange,
  first,
}: {
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  first?: boolean;
}) {
  const c = useColors();
  return (
    <View style={[styles.toggleRow, !first && { borderTopWidth: 1, borderTopColor: c.border }]}>
      <View style={styles.flex}>
        <T style={styles.toggleLabel}>{label}</T>
        {sub ? (
          <T tone="textSub" style={styles.checkSub}>
            {sub}
          </T>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: c.accent, false: c.barTrack }}
        thumbColor={value ? c.onAccent : c.solid}
        style={styles.switch}
      />
    </View>
  );
}

export function ErrorText({ children }: { children: string | null }) {
  const c = useColors();
  if (!children) return null;
  return (
    <View
      accessibilityRole="alert"
      style={[styles.error, { backgroundColor: c.statusOverBg, borderColor: c.statusOver }]}>
      <T style={[styles.errorText, { color: c.statusOver }]}>{children}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  field: { gap: Space.xs, marginTop: Space.l },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: Space.s },
  label: { fontSize: 16, fontWeight: '800' },
  required: { fontSize: 12, fontWeight: '900', borderWidth: 1, borderRadius: 4, paddingHorizontal: 4 },
  input: { minHeight: MinTap, borderWidth: 2, borderRadius: 12, paddingHorizontal: 16 },
  multiline: { minHeight: 110, paddingTop: Space.m, textAlignVertical: 'top' },
  hint: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  moneyRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderRadius: 12, paddingHorizontal: 16 },
  moneyInput: { flex: 1, minHeight: MinTap, fontWeight: '800', fontVariant: ['tabular-nums'] },
  yen: { fontSize: 18, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.s, marginTop: Space.xs },
  chip: {
    minHeight: 50,
    minWidth: 72,
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: Space.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: 17, fontWeight: '800' },
  checkRow: {
    minHeight: MinTap + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.m,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  box: { width: 30, height: 30, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  boxMark: { fontSize: 20, fontWeight: '900', lineHeight: 24 },
  checkLabel: { fontSize: 18, fontWeight: '800' },
  checkSub: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  toggleRow: {
    minHeight: MinTap + 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.m,
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  toggleLabel: { fontSize: 17, fontWeight: '700' },
  switch: { transform: [{ scale: 1.15 }] },
  error: { borderWidth: 2, borderRadius: 12, padding: 16, marginTop: Space.l },
  errorText: { fontSize: 16, fontWeight: '800' },
});
