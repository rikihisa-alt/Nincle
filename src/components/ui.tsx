import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { fontFor, type FontRole } from '@/constants/fonts';
import { MinTap, Space, useColors, type Colors } from '@/constants/theme';
import type { DueState } from '@/lib/date';
import { usePrefs } from '@/providers/prefs';

export type IconName = { ios: SymbolViewProps['name'] & string; android: string; web: string };

/** SF Symbols（iOS）と Material Symbols（Android / Web）の名前をまとめて渡す */
export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color: string }) {
  const { scale } = usePrefs();
  const s = Math.round(size * Math.min(scale, 1.25));
  return (
    <SymbolView
      name={name as SymbolViewProps['name']}
      size={s}
      tintColor={color}
      resizeMode="scaleAspectFit"
      style={{ width: s, height: s }}
    />
  );
}

export const Icons = {
  calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  site: { ios: 'hammer', android: 'construction', web: 'construction' },
  ninku: { ios: 'sum', android: 'calculate', web: 'calculate' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
  pin: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' },
  people: { ios: 'person.2', android: 'group', web: 'group' },
  person: { ios: 'person', android: 'person', web: 'person' },
  clock: { ios: 'clock', android: 'schedule', web: 'schedule' },
  check: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  cross: { ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  question: { ios: 'questionmark.circle.fill', android: 'help', web: 'help' },
  warning: { ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' },
  info: { ios: 'info.circle.fill', android: 'info', web: 'info' },
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  chevronLeft: { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' },
  back: { ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' },
  edit: { ios: 'square.and.pencil', android: 'edit_note', web: 'edit_note' },
  download: { ios: 'square.and.arrow.down', android: 'download', web: 'download' },
  share: { ios: 'square.and.arrow.up', android: 'share', web: 'share' },
  bell: { ios: 'bell.fill', android: 'notifications', web: 'notifications' },
  camera: { ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' },
  photo: { ios: 'photo', android: 'image', web: 'image' },
  send: { ios: 'paperplane.fill', android: 'send', web: 'send' },
  add: { ios: 'plus', android: 'add', web: 'add' },
  phone: { ios: 'phone.fill', android: 'call', web: 'call' },
  map: { ios: 'map', android: 'map', web: 'map' },
  lock: { ios: 'lock.fill', android: 'lock', web: 'lock' },
  unlock: { ios: 'lock.open', android: 'lock_open', web: 'lock_open' },
  history: { ios: 'clock.arrow.circlepath', android: 'history', web: 'history' },
  trash: { ios: 'trash', android: 'delete', web: 'delete' },
  archive: { ios: 'archivebox', android: 'inventory_2', web: 'inventory_2' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  copy: { ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' },
  sun: { ios: 'sun.max', android: 'light_mode', web: 'light_mode' },
  text: { ios: 'textformat.size', android: 'format_size', web: 'format_size' },
  help: { ios: 'questionmark.circle', android: 'help_outline', web: 'help_outline' },
  wifiOff: { ios: 'wifi.slash', android: 'wifi_off', web: 'wifi_off' },
  crown: { ios: 'crown', android: 'military_tech', web: 'military_tech' },
  list: { ios: 'list.bullet', android: 'list', web: 'list' },
} satisfies Record<string, IconName>;

/**
 * 言葉の途中で改行しない（「改／修」「20,000〜／21,000円」のような折れ方を防ぐ）。
 * 空白・句読点・括弧のところで折り返し、それでも入らない長い文だけ途中で折る。
 * iOS・Android は OS が日本語の言葉の切れ目で折り返す。
 */
/** クリアパネル：半透明の上に、Web では後ろをぼかす。影は薄く */
const GLASS = (Platform.OS === 'web'
  ? { backdropFilter: 'blur(14px) saturate(140%)', WebkitBackdropFilter: 'blur(14px) saturate(140%)' }
  : {}) as ViewStyle;

const WEB_KEEP_WORDS = (Platform.OS === 'web' ? { wordBreak: 'keep-all', overflowWrap: 'anywhere' } : {}) as TextStyle;

/**
 * 文字はすべてこれで出す。アプリの「文字の大きさ」設定を掛け、端末の設定にも追従する
 * （ただし画面が崩れないよう、端末側の拡大は 1.6 倍で止める）。
 */
export function T({ style, tone = 'text', font, ...props }: TextProps & { tone?: keyof Colors; font?: FontRole }) {
  const c = useColors();
  const { scale } = usePrefs();
  const flat = StyleSheet.flatten([styles.baseText, { color: c[tone] }, style]) as TextStyle;
  const role = font ?? autoRole(flat);
  const size = (flat.fontSize ?? 16) * scale;
  const scaled: TextStyle = {
    ...flat,
    ...fontFor(role, weightOf(flat)),
    fontSize: size,
    // 日本語は行間を広めに（見出しは詰める）。指定があればそれを使う
    lineHeight: flat.lineHeight ? flat.lineHeight * scale : Math.round(size * (role === 'body' ? 1.45 : 1.25)),
  };
  return <Text maxFontSizeMultiplier={1.6} {...props} style={[scaled, WEB_KEEP_WORDS]} />;
}

export function weightOf(style: TextStyle): number {
  const w = style.fontWeight;
  if (w === 'bold') return 700;
  if (w === undefined || w === 'normal') return 400;
  return Number(w) || 400;
}

/** 大きく太い文字（画面の見出し・現場名など）は見出し用の書体、それ以外は本文用 */
function autoRole(style: TextStyle): FontRole {
  return (style.fontSize ?? 16) >= 20 && weightOf(style) >= 800 ? 'heading' : 'body';
}

/** 文字の幅の目安（1文字＝1em）。太字の数字は思ったより広いので、はみ出さないよう広めに見積もる */
function estimateEm(text: string): number {
  let em = 0;
  for (const ch of text) {
    if (/[.,:'・]/.test(ch)) em += 0.4;
    else if (/[ -~]/.test(ch)) em += 0.76;
    else em += 1.06;
  }
  return Math.max(em, 1);
}

/**
 * 1行に収める文字（人工・金額・日付など）。途中で折り返さず、入りきらなければ小さくする。
 * 端末でもWebでも同じように効くよう、置かれた幅から文字の大きさを計算する。
 */
export function FitText({
  children,
  style,
  tone = 'text',
  align = 'left',
  boxStyle,
  font = 'number',
  ...props
}: Omit<TextProps, 'children'> & {
  children: string | number;
  /** 既定は数字用の書体。日付の見出しなどは heading */
  font?: FontRole;
  tone?: keyof Colors;
  align?: 'left' | 'right' | 'center';
  /** 横並びの中で使うときは、幅（flex: 1 や width）をここで決める */
  boxStyle?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const { scale } = usePrefs();
  const [width, setWidth] = useState(0);
  const text = String(children);
  const flat = StyleSheet.flatten([styles.baseText, { color: c[tone] }, style]) as TextStyle;
  const desired = (flat.fontSize ?? 16) * scale;
  const size = width > 0 ? Math.min(desired, Math.floor((width - 6) / estimateEm(text))) : desired;
  const lineHeight = Math.round(desired * 1.2);
  // 文字は枠の中に重ねて置く。枠の大きさが文字に左右されないので、測り直しの繰り返しが起きない
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={[styles.fitBox, { height: lineHeight }, boxStyle]}>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1}
        {...props}
        style={[
          flat,
          fontFor(font, weightOf(flat)),
          styles.fitText,
          { fontSize: size, lineHeight, textAlign: align },
        ]}>
        {text}
      </Text>
    </View>
  );
}

/** セクション見出し（「今日の段取り」など）。右側に補足やリンクを置ける */
export function SectionLabel({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <T tone="textSub" accessibilityRole="header" font="heading" style={styles.sectionLabel}>
        {children}
      </T>
      {right}
    </View>
  );
}

/** 工程表の短冊に見立てたカード。左端に太い帯を引く */
export function Tanzaku({
  children,
  stripe,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  stripe?: string;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  const body = (
    <View style={[styles.tanzaku, GLASS, { backgroundColor: c.card, borderColor: c.border }, style]}>
      <View style={[styles.stripe, { backgroundColor: stripe ?? c.statusActive }]} />
      <View style={styles.tanzakuBody}>{children}</View>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      {body}
    </Pressable>
  );
}

/** 枠だけのカード */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[styles.card, GLASS, { backgroundColor: c.card, borderColor: c.border }, style]}>{children}</View>;
}

export function dueColor(c: Colors, state: DueState) {
  if (state === 'over') return { fg: c.statusOver, bg: c.statusOverBg };
  if (state === 'soon') return { fg: c.statusSoon, bg: c.statusSoonBg };
  return { fg: c.statusActive, bg: c.cardAlt };
}

/** 状態は色だけでなくアイコンと文字を必ず併記する */
export function DueBadge({ state, daysLeft }: { state: DueState; daysLeft: number }) {
  const c = useColors();
  const { fg, bg } = dueColor(c, state);
  const label = state === 'over' ? `納期を${-daysLeft}日超過` : daysLeft === 0 ? '今日が納期' : `納期まで${daysLeft}日`;
  return <Chip label={label} icon={state === 'active' ? Icons.clock : Icons.warning} fg={fg} bg={bg} />;
}

export function Chip({ label, fg, bg, icon }: { label: string; fg: string; bg: string; icon?: IconName }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: fg }]}>
      {icon && <Icon name={icon} size={16} color={fg} />}
      <T style={[styles.badgeText, { color: fg }]}>{label}</T>
    </View>
  );
}

/** 未読数などの丸い数字 */
export function CountBadge({ count }: { count: number }) {
  const c = useColors();
  if (count <= 0) return null;
  return (
    <View style={[styles.count, { backgroundColor: c.statusOver }]}>
      <T style={styles.countText}>{count > 99 ? '99+' : String(count)}</T>
    </View>
  );
}

export type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger';

export function BigButton({
  label,
  onPress,
  kind = 'primary',
  icon,
  selected,
  disabled,
  busy,
  style,
  accessibilityHint,
  compact,
}: {
  label: string;
  onPress?: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  selected?: boolean;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  /** 一覧の中などで少し小さく（それでも 48px 以上） */
  compact?: boolean;
}) {
  const c = useColors();
  const isPrimary = (kind === 'primary' || selected) && !disabled;
  const bg = disabled
    ? c.cardAlt
    : isPrimary
      ? c.accent
      : kind === 'danger'
        ? c.statusOverBg
        : kind === 'secondary'
          ? c.cardAlt
          : 'transparent';
  const fg = disabled ? c.textSub : isPrimary ? c.onAccent : kind === 'danger' ? c.statusOver : c.text;
  const border = disabled ? c.border : isPrimary ? c.onAccent : kind === 'danger' ? c.statusOver : c.border;
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: inactive, busy }}
      accessibilityHint={accessibilityHint}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: bg, borderColor: border, borderStyle: kind === 'ghost' && !selected ? 'dashed' : 'solid' },
        pressed && styles.pressed,
        style,
      ]}>
      {busy ? <ActivityIndicator color={fg} /> : icon && <Icon name={icon} size={compact ? 20 : 22} color={fg} />}
      <T style={[styles.buttonText, compact && styles.buttonTextCompact, { color: fg }]}>{label}</T>
    </Pressable>
  );
}

/** 2〜4択の切り替え（タブ・期間など） */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { key: K; label: string; badge?: number }[];
  value: K;
  onChange: (k: K) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  return (
    <View accessibilityRole="tablist" style={[styles.segment, { borderColor: c.border, backgroundColor: c.cardAlt }, style]}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.key)}
            style={[styles.segmentItem, active && { backgroundColor: c.text }]}>
            <T style={[styles.segmentText, { color: active ? c.bg : c.text }]}>{o.label}</T>
            {o.badge ? <CountBadge count={o.badge} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** 人工は数字と横棒だけで見せる */
export function Bar({ value, max, color }: { value: number; max: number; color?: string }) {
  const c = useColors();
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
      style={[styles.barTrack, { backgroundColor: c.barTrack }]}>
      <View style={[styles.barFill, { width: `${ratio * 100}%`, backgroundColor: color ?? c.accent }]} />
    </View>
  );
}

/** 一覧の1行。押せる行は右に「›」を出す */
export function ListRow({
  title,
  sub,
  left,
  right,
  onPress,
  first,
  accessibilityLabel,
}: {
  title: string;
  sub?: string | null;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  first?: boolean;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  const content = (
    <View style={[styles.listRow, !first && { borderTopWidth: 1, borderTopColor: c.border }]}>
      {left}
      <View style={styles.flex}>
        <T style={styles.listTitle}>{title}</T>
        {sub ? (
          <T tone="textSub" style={styles.listSub}>
            {sub}
          </T>
        ) : null}
      </View>
      {right}
      {onPress && <Icon name={Icons.chevron} size={20} color={c.textSub} />}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, sub].filter(Boolean).join('、')}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      {content}
    </Pressable>
  );
}

/** 名前の頭文字の丸。顔の代わりに、誰の書き込みかひと目で分かるように */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const c = useColors();
  const ch = (name || '？').slice(0, 1);
  const palette = ['#D99A00', '#2F7FC1', '#2E8B57', '#D2581A', '#8B5CF6', '#0E8A9A', '#C2417A'];
  let h = 0;
  for (const x of name) h = (h + x.charCodeAt(0)) % palette.length;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: palette[h], borderColor: c.card }]}>
      <T style={[styles.avatarText, { fontSize: size * 0.45 }]}>{ch}</T>
    </View>
  );
}

/** − 数字 ＋ */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 24,
  unit,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit: string;
  label: string;
}) {
  const c = useColors();
  const btn = (text: string, next: number, a11y: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      disabled={next < min || next > max}
      onPress={() => onChange(Math.round(next * 100) / 100)}
      style={({ pressed }) => [
        styles.stepBtn,
        { borderColor: c.border, backgroundColor: c.cardAlt, opacity: next < min || next > max ? 0.4 : 1 },
        pressed && styles.pressed,
      ]}>
      <T style={styles.stepText}>{text}</T>
    </Pressable>
  );
  return (
    <View style={styles.stepper} accessible={false}>
      {btn('−', value - step, `${label}を減らす`)}
      <View style={styles.stepValue} accessible accessibilityLabel={`${label} ${value}${unit}`}>
        <FitText style={styles.stepNum} align="center" boxStyle={styles.stepNumBox}>
          {value}
        </FitText>
        <T tone="textSub" style={styles.stepUnit}>
          {unit}
        </T>
      </View>
      {btn('＋', value + step, `${label}を増やす`)}
    </View>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={[styles.empty, { borderColor: c.border }]}>
      <T style={styles.emptyTitle}>{title}</T>
      {body ? (
        <T tone="textSub" style={styles.emptyBody}>
          {body}
        </T>
      ) : null}
      {action}
    </View>
  );
}

export function LoadingView({ label = '読み込み中…' }: { label?: string }) {
  const c = useColors();
  return (
    <View style={styles.loading} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={c.text} />
      <T tone="textSub" style={styles.loadingText}>
        {label}
      </T>
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const c = useColors();
  return (
    <View style={[styles.errorBox, { backgroundColor: c.statusOverBg, borderColor: c.statusOver }]} accessibilityRole="alert">
      <View style={styles.row}>
        <Icon name={Icons.warning} size={24} color={c.statusOver} />
        <T style={[styles.errorText, { color: c.statusOver }]}>{message}</T>
      </View>
      {onRetry && <BigButton label="もう一回読み込む" kind="secondary" onPress={onRetry} compact />}
    </View>
  );
}

/** 補足の説明（使い方のヒント） */
export function Hint({ children }: { children: string }) {
  const c = useColors();
  return (
    <View style={[styles.hint, { backgroundColor: c.infoBg, borderColor: c.info }]}>
      <Icon name={Icons.info} size={20} color={c.info} />
      <T style={[styles.hintText, { color: c.text }]}>{children}</T>
    </View>
  );
}

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.s },
  baseText: { fontSize: 16 },
  fitBox: { alignSelf: 'stretch', minWidth: 0 },
  fitText: { position: 'absolute', left: 0, right: 0, top: 0 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Space.s,
    marginTop: Space.xl,
    marginBottom: Space.s,
  },
  sectionLabel: { fontSize: 15, fontWeight: '800', letterSpacing: 1.5 },
  tanzaku: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  stripe: { width: 7 },
  tanzakuBody: { flex: 1, paddingHorizontal: 22, paddingVertical: 20, gap: 10 },
  card: { borderWidth: 1, borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 14, fontWeight: '800' },
  count: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  button: {
    minHeight: MinTap,
    borderRadius: 12,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.s,
    paddingHorizontal: 20,
    paddingVertical: Space.s,
  },
  buttonCompact: { minHeight: 48, paddingHorizontal: Space.m },
  buttonText: { fontSize: 18, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
  buttonTextCompact: { fontSize: 16 },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 4, gap: 4 },
  segmentItem: {
    flex: 1,
    minHeight: 50,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 4,
  },
  segmentText: { fontSize: 16, fontWeight: '900', textAlign: 'center' },
  barTrack: { height: 12, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%' },
  listRow: {
    minHeight: MinTap + 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.m,
    paddingHorizontal: 22,
    paddingVertical: 16,
  },
  listTitle: { fontSize: 18, fontWeight: '800' },
  listSub: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  avatar: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  avatarText: { color: '#FFFFFF', fontWeight: '900' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Space.s },
  stepBtn: { width: MinTap, height: MinTap, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 26, fontWeight: '900' },
  stepValue: { minWidth: 84, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 2 },
  stepNumBox: { width: 60, alignSelf: 'auto' },
  stepNum: { fontSize: 26, fontWeight: '900', fontVariant: ['tabular-nums'] },
  stepUnit: { fontSize: 15, fontWeight: '700' },
  empty: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 14, paddingHorizontal: 22, paddingVertical: 20, gap: 10, alignItems: 'stretch' },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptyBody: { fontSize: 15, fontWeight: '600', lineHeight: 22 },
  loading: { paddingVertical: Space.xl * 2, alignItems: 'center', gap: Space.m },
  loadingText: { fontSize: 16, fontWeight: '700' },
  errorBox: { borderWidth: 2, borderRadius: 14, padding: 18, gap: Space.m, marginTop: Space.l },
  errorText: { flex: 1, fontSize: 16, fontWeight: '800' },
  hint: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 16, alignItems: 'flex-start' },
  hintText: { flex: 1, fontSize: 15, fontWeight: '600', lineHeight: 22 },
  pressed: { opacity: 0.7 },
});
