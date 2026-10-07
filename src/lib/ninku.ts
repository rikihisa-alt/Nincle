/**
 * 人工（にんく）の計算はすべてこのファイルに集める。
 * 1日 = 1.0人工、半日 = 0.5人工。残業は現場ごとの換算ルールで足す。
 */

export type DayUnit = 1.0 | 0.5;

export type OvertimeRule =
  /** 時間割り：hoursPerNinku 時間で 1人工（既定は 8時間＝残業2時間で0.25人工） */
  | { kind: 'hourly'; hoursPerNinku: number }
  /** 固定加算：残業があれば時間に関係なく addNinku を足す */
  | { kind: 'fixed'; addNinku: number }
  /** 換算しない */
  | { kind: 'none' };

export const DEFAULT_OVERTIME_RULE: OvertimeRule = { kind: 'hourly', hoursPerNinku: 8 };

/** 浮動小数の誤差を出さないよう 1/1000 人工で丸める */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function overtimeNinku(hours: number, rule: OvertimeRule): number {
  if (hours <= 0) return 0;
  switch (rule.kind) {
    case 'hourly':
      return round3(hours / rule.hoursPerNinku);
    case 'fixed':
      return rule.addNinku;
    case 'none':
      return 0;
  }
}

export function computeNinku(unit: DayUnit, overtimeHours: number, rule: OvertimeRule): number {
  return round3(unit + overtimeNinku(overtimeHours, rule));
}

export function sumNinku(values: number[]): number {
  return round3(values.reduce((a, b) => a + b, 0));
}

/** 金額は円単位で四捨五入 */
export function ninkuAmount(ninku: number, unitPrice: number): number {
  return Math.round(ninku * unitPrice);
}

/** 0.5 や 0.25 が潰れないよう、整数でも小数1桁は必ず出す */
export function formatNinku(n: number): string {
  const s = String(round3(n));
  return s.includes('.') ? s : `${s}.0`;
}

export function formatYen(n: number): string {
  return n.toLocaleString('ja-JP');
}

/** 換算ルールを言葉で */
export function describeOvertimeRule(rule: OvertimeRule): string {
  switch (rule.kind) {
    case 'hourly':
      return `残業${rule.hoursPerNinku}時間で1人工（2時間なら${formatNinku(2 / rule.hoursPerNinku)}人工）`;
    case 'fixed':
      return `残業があれば、時間に関係なく${formatNinku(rule.addNinku)}人工たす`;
    case 'none':
      return '残業は人工に入れない';
  }
}

/** 1日＋残業2時間 */
export function describeAttendance(unit: number, overtimeHours: number): string {
  return `${unit === 1 ? '1日' : '半日'}${overtimeHours > 0 ? `＋残業${overtimeHours}時間` : ''}`;
}
