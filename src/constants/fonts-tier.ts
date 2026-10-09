/** 指定の太さを 3 段にまとめる（500〜700 は中、800 以上は太） */
export function tierOf(weight: number): 400 | 500 | 700 {
  if (weight >= 800) return 700;
  if (weight >= 500) return 500;
  return 400;
}
