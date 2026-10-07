/** エラーは短い話し言葉で出す。DB 側で日本語を投げたものはそのまま使う */
export function toMessage(e: unknown): string {
  const raw =
    e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' ? e.message : String(e);

  if (/[ぁ-んァ-ン一-龥]/.test(raw)) return raw;
  if (/network|fetch|load failed|timed? ?out/i.test(raw)) return '電波が悪いみたいです。つながる所でもう一回';
  if (/token has expired|invalid.*otp|otp.*invalid/i.test(raw)) return 'コードが違うか、期限切れです';
  if (/rate limit|too many/i.test(raw)) return '続けて送りすぎです。少し待ってから';
  if (/email/i.test(raw) && /invalid/i.test(raw)) return 'メールアドレスを確かめてください';
  if (/duplicate key|unique/i.test(raw)) return 'もう登録されています';
  if (/row-level security|permission denied/i.test(raw)) return 'それはできません（権限がない）';
  return 'うまくいきませんでした。もう一回試してください';
}
