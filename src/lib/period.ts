/**
 * 締めの期間。チームの締め日（null は月末）で決まる。
 * 例：20日締めなら「10月分」は 9/21〜10/20。
 */
import { addDays, lastDayOfMonth, monthKey, shiftMonth } from './date.ts';

export type Period = {
  /** 'YYYY-MM'（その月分） */
  key: string;
  start: string;
  end: string;
  /** 10月分 */
  label: string;
};

export function periodOf(key: string, closingDay: number | null): Period {
  const m = Number(key.slice(5, 7));
  const label = `${m}月分`;
  if (closingDay === null) {
    return { key, start: `${key}-01`, end: lastDayOfMonth(key), label };
  }
  const day = String(closingDay).padStart(2, '0');
  const prevEnd = `${shiftMonth(key, -1)}-${day}`;
  return { key, start: addDays(prevEnd, 1), end: `${key}-${day}`, label };
}

/** その日がどの月分に入るか */
export function periodContaining(ymd: string, closingDay: number | null): Period {
  const key = monthKey(ymd);
  if (closingDay !== null && Number(ymd.slice(8, 10)) > closingDay) {
    return periodOf(shiftMonth(key, 1), closingDay);
  }
  return periodOf(key, closingDay);
}

export function shiftPeriod(p: Period, n: number, closingDay: number | null): Period {
  return periodOf(shiftMonth(p.key, n), closingDay);
}

export function inPeriod(ymd: string, p: Pick<Period, 'start' | 'end'>): boolean {
  return ymd >= p.start && ymd <= p.end;
}

export function closingDayLabel(closingDay: number | null): string {
  return closingDay === null ? '月末締め' : `${closingDay}日締め`;
}
