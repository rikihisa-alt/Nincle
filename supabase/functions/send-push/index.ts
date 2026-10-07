// notifications に行が入ったら、その人の端末へプッシュ通知を送る。
// Supabase ダッシュボード → Database → Webhooks で
//   テーブル public.notifications / イベント INSERT / 送り先 この Edge Function
// を設定する（README 参照）。Webhook のヘッダーに x-webhook-secret を付け、
// 同じ値を Edge Function の環境変数 WEBHOOK_SECRET に入れておく。
import { createClient } from 'npm:@supabase/supabase-js@2';

type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  payload: { title?: string; body?: string; site_id?: string; request_id?: string };
};

type ExpoTicket = { status: 'ok' | 'error'; details?: { error?: string } };

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }

  const { record } = (await req.json()) as { record: NotificationRow };
  const { data: tokens, error } = await supabase.from('push_tokens').select('token').eq('user_id', record.user_id);
  if (error) return new Response(error.message, { status: 500 });
  if (!tokens?.length) return new Response('no tokens');

  const messages = tokens.map(({ token }) => ({
    to: token,
    title: record.payload.title ?? 'ニンクル',
    body: record.payload.body ?? '',
    sound: 'default',
    // タップしたときにアプリが開く先
    data: { notificationId: record.id, type: record.type, siteId: record.payload.site_id },
    channelId: 'default',
  }));

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  const { data: tickets } = (await res.json()) as { data: ExpoTicket[] };

  // アプリを消した端末のトークンは掃除する
  const dead = tickets
    .map((t, i) => (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' ? tokens[i].token : null))
    .filter((t): t is string => t !== null);
  if (dead.length) await supabase.from('push_tokens').delete().in('token', dead);

  return new Response(JSON.stringify({ sent: messages.length, removed: dead.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
