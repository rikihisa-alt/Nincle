/**
 * 日付は JST の 'YYYY-MM-DD' 文字列で扱う。
 * 計算は UTC の 0時に置いて行い、端末のタイムゾーンで日付がずれないようにする。
 */
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const DAY_MS = 86400000;

function parts(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

function toYmd(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

function toTime(ymd: string): number {
  const { y, m, d } = parts(ymd);
  return Date.UTC(y, m - 1, d);
}

/** 日本時間の今日 */
export function todayJst(now: Date = new Date()): string {
  return toYmd(now.getTime() + 9 * 3600000);
}

/** 日本時間の今の時刻（10:05 など） */
export function nowTimeJst(now: Date = new Date()): string {
  const d = new Date(now.getTime() + 9 * 3600000);
  return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function addDays(ymd: string, n: number): string {
  return toYmd(toTime(ymd) + n * DAY_MS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toTime(to) - toTime(from)) / DAY_MS);
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function weekday(ymd: string): string {
  return WEEKDAYS[parts(ymd).dow];
}

export function dayOfWeek(ymd: string): number {
  return parts(ymd).dow;
}

/** 10月6日（火） */
export function formatLong(ymd: string): string {
  const { m, d } = parts(ymd);
  return `${m}月${d}日（${weekday(ymd)}）`;
}

/** 10/6 */
export function formatShort(ymd: string): string {
  const { m, d } = parts(ymd);
  return `${m}/${d}`;
}

/** 10/6（火） */
export function formatShortDow(ymd: string): string {
  return `${formatShort(ymd)}（${weekday(ymd)}）`;
}

export function dayOfMonth(ymd: string): string {
  return String(parts(ymd).d).padStart(2, '0');
}

/** 今日・明日・昨日なら言葉で、それ以外は 10/6（火） */
export function relativeDay(ymd: string, today: string): string {
  const diff = daysBetween(today, ymd);
  if (diff === 0) return `今日 ${formatShortDow(ymd)}`;
  if (diff === 1) return `明日 ${formatShortDow(ymd)}`;
  if (diff === -1) return `昨日 ${formatShortDow(ymd)}`;
  return formatShortDow(ymd);
}

/** 期間の表示：10/8（木）〜10/9（金） */
export function formatRange(from: string, to: string): string {
  return from === to ? formatShortDow(from) : `${formatShortDow(from)}〜${formatShortDow(to)}`;
}

/** タイムスタンプ（ISO）を日本時間の「10/5 16:42」に */
export function formatStamp(iso: string, today?: string): string {
  const t = new Date(iso).getTime() + 9 * 3600000;
  const d = new Date(t);
  const ymd = toYmd(t);
  const time = `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  if (today && ymd === today) return time;
  return `${formatShort(ymd)} ${time}`;
}

export function stampToYmd(iso: string): string {
  return toYmd(new Date(iso).getTime() + 9 * 3600000);
}

export type DueState = 'active' | 'soon' | 'over';

/** 納期まで3日以内を「間近」とする */
export function dueState(today: string, due: string): DueState {
  const left = daysBetween(today, due);
  if (left < 0) return 'over';
  if (left <= 3) return 'soon';
  return 'active';
}

/** 'YYYY-MM' */
export function monthKey(ymd: string): string {
  return ymd.slice(0, 7);
}

export function shiftMonth(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return t.toISOString().slice(0, 7);
}

export function lastDayOfMonth(key: string): string {
  return addDays(`${shiftMonth(key, 1)}-01`, -1);
}

/** 月カレンダー用：日曜始まりの週ごとの日付（前後の月の日は null） */
export function monthGrid(key: string): (string | null)[][] {
  const first = `${key}-01`;
  const last = lastDayOfMonth(key);
  const cells: (string | null)[] = Array(dayOfWeek(first)).fill(null);
  for (const d of eachDay(first, last)) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function formatMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${y}年${m}月`;
}

export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toYmd(toTime(s)) === s;
}
