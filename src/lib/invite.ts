import { inviteUrl } from '@/data/supabase-api';

export { inviteUrl };

export function inviteMessage(teamName: string, token: string): string {
  return [
    `「${teamName}」に入ってください。ニンクルで段取りと出面を共有します。`,
    inviteUrl(token),
    `（リンクが開けんときは、アプリの「チーム」→「招待コードで入る」に ${token} を入れてください）`,
  ].join('\n');
}

/** 招待コードだけ貼られたときも、リンクごと貼られたときも受け付ける */
export function extractInviteToken(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/invite\/([A-Za-z0-9_-]{8,})/);
  if (fromUrl) return fromUrl[1];
  return /^[A-Za-z0-9_-]{8,}$/.test(trimmed) ? trimmed : null;
}
