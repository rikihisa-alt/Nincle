// マイグレーションを PGlite（WASM版 Postgres）に流し、RLS と RPC の効き方を確かめる。
// Supabase 本体は不要。npm run test:db で実行する。
import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { computeNinku } from '../../src/lib/ninku.ts';

const dir = new URL('../migrations/', import.meta.url);
// pg_cron は PGlite にないので除く
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql') && !f.includes('cron')).sort();

const db = new PGlite();

// Supabase 環境の最小スタブ
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create schema extensions; create schema storage;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql volatile as $$
    select substring(decode(md5(random()::text) || md5(random()::text), 'hex') from 1 for n) $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create publication supabase_realtime;
  grant usage on schema public, auth, extensions, storage to anon, authenticated;
  grant all on storage.objects to authenticated;
  grant execute on all functions in schema auth, extensions to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`);
for (const f of files) {
  await db.exec(fs.readFileSync(new URL(f, dir), 'utf8'));
}
console.log(`migrations OK (${files.join(', ')})`);

const A = '00000000-0000-0000-0000-00000000000a'; // 親方
const B = '00000000-0000-0000-0000-00000000000b'; // メンバー
const C = '00000000-0000-0000-0000-00000000000c'; // チーム外
const D = '00000000-0000-0000-0000-00000000000d'; // メンバー（未回答・退会する人）
await db.exec(`insert into auth.users (id, raw_user_meta_data) values
  ('${A}', '{"display_name":"田中"}'), ('${B}', '{}'), ('${C}', '{}'), ('${D}', '{}')`);
await db.exec(`update public.users set display_name = '西' where id = '${B}';
  update public.users set display_name = '岡' where id = '${D}';`);

async function as(uid, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}
async function fails(uid, sql, params) {
  try {
    await as(uid, sql, params);
  } catch (e) {
    return e.message;
  }
  throw new Error('should fail: ' + sql);
}
async function sys(sql, params) {
  await db.exec('reset role');
  return (await db.query(sql, params)).rows;
}
const ok = (name) => console.log('  ✔', name);

// ---------------- チーム ----------------
assert.equal((await as(A, 'select display_name from users where id = $1', [A]))[0].display_name, '田中');
ok('サインアップでプロフィール行ができる');

const [{ create_team: team }] = await as(A, `select create_team('塚本組')`);
assert.equal((await as(A, 'select role from team_members where team_id=$1', [team]))[0].role, 'owner');
ok('チーム作成で owner になる');

await fails(B, `insert into teams (name, owner_user_id) values ('x', '${B}')`);
await fails(B, `insert into team_members (team_id, user_id) values ('${team}', '${B}')`);
ok('チームやメンバーを直接 insert できない');

const [{ token }] = await as(A, `insert into team_invites (team_id, created_by) values ($1, $2) returning token`, [team, A]);
assert.match(token, /^[A-Za-z0-9_-]{16}$/);
assert.match(await fails(B, `insert into team_invites (team_id, created_by) values ($1, $2)`, [team, B]), /row-level security/);
ok('招待リンクは owner だけ発行できる');

const preview = await as(B, 'select * from get_invite_preview($1)', [token]);
assert.equal(preview[0].team_name, '塚本組');
assert.equal(preview[0].already_member, false);
assert.equal((await as(B, 'select * from get_invite_preview($1)', ['bad'])).length, 0);
await as(B, 'select accept_invite($1)', [token]);
await as(B, 'select accept_invite($1)', [token]);
await as(D, 'select accept_invite($1)', [token]);
assert.equal((await as(B, 'select * from teams')).length, 1);
assert.equal((await as(A, 'select * from team_members where team_id=$1', [team])).length, 3);
ok('招待リンクで参加できる（2回目は何もしない）');

assert.match(await fails(C, 'select accept_invite($1)', ['bad']), /招待リンク/);
assert.equal((await as(C, 'select * from teams')).length, 0);
assert.deepEqual((await as(C, 'select id from users')).map((r) => r.id), [C]);
assert.equal((await as(B, 'select id from users')).length, 3);
ok('チーム外の人からはチームも仲間も見えない');

await as(A, `update team_invites set expires_at = now() - interval '1 second' where token = $1`, [token]);
assert.match(await fails(C, 'select accept_invite($1)', [token]), /招待リンク/);
ok('期限切れの招待は使えない');

// ---------------- 現場 ----------------
const [{ create_site: site }] = await as(
  A,
  `select create_site($1, '塚本ハイツ 改修', '大阪市淀川区', '丸和建設', '2026-09-18', '2026-10-09', 20000, $2)`,
  [team, `{${B},${C},${D}}`],
);
assert.equal((await as(A, 'select * from site_members where site_id=$1', [site])).length, 3);
assert.equal((await as(B, 'select * from sites')).length, 1);
assert.equal((await as(C, 'select * from sites')).length, 0);
await fails(C, `select create_site($1, 'x', null, null, '2026-10-01', '2026-10-02', 0)`, [team]);
ok('現場は現場メンバーにしか見えず、チーム外の人は入れられない');

// ---------------- チャット・既読・通知 ----------------
await as(B, `insert into messages (site_id, user_id, body) values ($1, $2, '搬入終わってます')`, [site, B]);
await fails(C, `insert into messages (site_id, user_id, body) values ($1, $2, 'x')`, [site, C]);
await fails(B, `insert into messages (site_id, user_id, body) values ($1, $2, 'なりすまし')`, [site, A]);
assert.equal((await as(C, 'select * from messages')).length, 0);
ok('チャットは現場メンバーだけ、なりすまし不可');

assert.equal(Number((await as(A, 'select unread from my_unread_counts() where site_id=$1', [site]))[0].unread), 1);
await as(A, 'select mark_site_read($1)', [site]);
assert.equal(Number((await as(A, 'select unread from my_unread_counts() where site_id=$1', [site]))[0].unread), 0);
assert.equal((await as(A, `select * from notifications where type = 'message'`)).length, 1);
assert.equal((await as(B, `select * from notifications where type = 'message'`)).length, 0);
ok('未読数が数えられ、書いた人以外に通知が行く');

await as(D, 'update users set notify_chat = false where id = $1', [D]);
await as(B, `insert into messages (site_id, user_id, body) values ($1, $2, 'もう一件')`, [site, B]);
assert.equal((await as(D, `select * from notifications where type = 'message'`)).length, 1);
ok('通知を切った人には届かない');

assert.equal((await as(A, `select * from notifications`)).every((n) => n.user_id === A), true);
ok('通知は自分宛てしか見えない');

await fails(B, `select notify_user($1, 'message', '{"title":"偽物"}')`, [A]);
await fails(B, `select current_unit_price($1, $2)`, [site, B]);
await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
await assert.rejects(db.query(`select * from get_invite_preview('x')`));
await assert.rejects(db.query(`select create_team('x')`));
await db.exec('reset role');
ok('内部用の関数は端末から呼べない。未ログインでは RPC を呼べない');

await as(B, `insert into storage.objects (bucket_id, name) values ('site-photos', $1)`, [`${site}/a.jpg`]);
await fails(C, `insert into storage.objects (bucket_id, name) values ('site-photos', $1)`, [`${site}/b.jpg`]);
assert.equal((await as(C, `select * from storage.objects`)).length, 0);
assert.equal((await as(A, `select * from storage.objects`)).length, 1);
ok('写真は現場メンバーだけが上げ・見られる');

// ---------------- 予定確認 ----------------
const [req] = await as(
  A,
  `insert into schedule_requests (site_id, created_by, target_date_from, target_date_to, meet_time, note)
   values ($1, $2, '2026-10-08', '2026-10-09', '8:00', 'ボード貼り') returning *`,
  [site, A],
);
await fails(B, `insert into schedule_requests (site_id, created_by, target_date_from, target_date_to) values ($1, $2, '2026-10-08', '2026-10-08')`, [site, B]);
assert.equal((await as(B, `select * from notifications where type = 'schedule_request'`)).length, 1);
ok('予定確認は管理者だけが出せ、メンバーに通知が行く');

await as(B, `insert into schedule_replies (request_id, user_id, answer) values ($1, $2, 'yes')`, [req.id, B]);
await fails(B, `insert into schedule_replies (request_id, user_id, answer) values ($1, $2, 'yes')`, [req.id, D]);
assert.equal(await as(A, 'select nudge_schedule_request($1) as n', [req.id]).then((r) => r[0].n), 1);
assert.match(await fails(A, 'select nudge_schedule_request($1)', [req.id]), /30分/);
await fails(B, 'select nudge_schedule_request($1)', [req.id]);
assert.equal((await as(D, `select * from notifications where type = 'nudge'`)).length, 1);
ok('回答は本人だけ。つつくのは未回答者にだけ、30分に1回');

await fails(B, `select confirm_schedule($1, $2, $3)`, [req.id, `{${B}}`, '{2026-10-08}']);
assert.equal((await as(A, `select confirm_schedule($1, $2, $3) as n`, [req.id, `{${B},${C}}`, '{2026-10-08,2026-10-09,2026-10-20}']))[0].n, 2);
const assigned = await as(B, 'select * from assignments order by work_date');
assert.deepEqual(assigned.map((a) => a.work_date.toISOString().slice(0, 10)), ['2026-10-08', '2026-10-09']);
assert.equal(assigned[0].meet_time, '8:00');
assert.equal((await as(B, `select status from schedule_requests where id = $1`, [req.id]))[0].status, 'closed');
assert.equal((await as(B, `select * from notifications where type = 'assignment'`)).length, 1);
await fails(B, `insert into schedule_replies (request_id, user_id, answer) values ($1, $2, 'no')`, [req.id, D]);
ok('確定で予定が入り（範囲外の日・現場外の人は無視）、本人に通知。締めた確認には答えられない');

const busy = await as(D, `select * from team_busy_days($1, '2026-10-01', '2026-10-31')`, [team]);
assert.equal(busy.length, 2);
assert.deepEqual(Object.keys(busy[0]).sort(), ['user_id', 'work_date']);
await as(B, 'update users set calendar_public = false where id = $1', [B]);
assert.equal((await as(D, `select * from team_busy_days($1, '2026-10-01', '2026-10-31')`, [team])).length, 0);
assert.equal((await as(C, `select * from team_busy_days($1, '2026-10-01', '2026-10-31')`, [team])).length, 0);
ok('仲間の空きは、公開している人の「埋まっている日」だけ見える（現場名は出ない）');

// ---------------- 出面 ----------------
const [att] = await as(
  B,
  `insert into attendances (site_id, user_id, work_date, unit, overtime_hours, computed_ninku, entered_by, approved_at)
   values ($1, $2, '2026-10-02', 1.0, 2, 99, $2, now()) returning *`,
  [site, B],
);
assert.equal(att.approved_at, null);
assert.equal(Number(att.computed_ninku), 1.25);
assert.equal(att.unit_price, 20000);
ok('メンバーは自分で承認できない。人工と単価はサーバーで決まる（送った 99 は無視）');

await fails(B, `insert into attendances (site_id, user_id, work_date, unit, computed_ninku, entered_by) values ($1, $2, '2026-10-03', 1.0, 1, $3)`, [site, A, B]);
ok('メンバーは他人の出面を入れられない');

await as(B, `update attendances set unit = 0.5 where id = $1`, [att.id]);
assert.equal(Number((await as(B, 'select computed_ninku from attendances where id=$1', [att.id]))[0].computed_ninku), 0.75);
await as(A, `update attendances set approved_at = now() where id = $1`, [att.id]);
const [approved] = await as(A, 'select * from attendances where id=$1', [att.id]);
assert.equal(approved.approved_by, A);
assert.equal((await as(B, `update attendances set unit = 1.0 where id = $1 returning id`, [att.id])).length, 0);
assert.equal((await as(A, 'select * from attendance_histories where attendance_id=$1', [att.id])).length, 2);
ok('管理者が承認でき、承認後は本人が直せない。修正履歴が残る');

const [proxy] = await as(
  A,
  `insert into attendances (site_id, user_id, work_date, unit, computed_ninku, entered_by) values ($1, $2, '2026-10-03', 1.0, 1, $3) returning *`,
  [site, B, A],
);
assert.notEqual(proxy.approved_at, null);
assert.equal((await as(B, 'select * from attendances')).length, 2);
assert.equal((await as(D, 'select * from attendances')).length, 0);
ok('管理者の代理入力は承認済みになる。他のメンバーの出面は見えない');

await as(A, `update site_members set unit_price = 22000 where site_id = $1 and user_id = $2`, [site, B]);
assert.deepEqual((await as(B, 'select unit_price from attendances order by work_date')).map((r) => r.unit_price), [22000, 22000]);
assert.equal((await as(A, 'select * from attendance_histories where attendance_id=$1', [att.id])).length, 2);
ok('単価を変えると未確定の出面に付け替わる（履歴は増えない）');

// ---------------- 締め ----------------
await fails(B, `select close_period($1, '2026-10-01', '2026-10-31')`, [team]);
const [{ close_period: closing }] = await as(A, `select close_period($1, '2026-10-01', '2026-10-31')`, [team]);
assert.match(await fails(A, `update attendances set unit = 0.5 where id = $1`, [proxy.id]), /確定済み/);
assert.match(await fails(A, `delete from attendances where id = $1`, [proxy.id]), /確定済み/);
assert.match(await fails(B, `insert into attendances (site_id, user_id, work_date, unit, computed_ninku, entered_by) values ($1, $2, '2026-10-05', 1.0, 1, $2)`, [site, B]), /確定済み/);
await as(A, `update site_members set unit_price = 25000 where site_id = $1 and user_id = $2`, [site, B]);
assert.deepEqual((await as(B, 'select unit_price from attendances order by work_date')).map((r) => r.unit_price), [22000, 22000]);
assert.equal((await as(B, 'select * from closings')).length, 1);
await fails(B, 'select reopen_period($1)', [closing]);
await as(A, 'select reopen_period($1)', [closing]);
await as(A, `update attendances set unit = 0.5 where id = $1`, [proxy.id]);
ok('確定した月は出面も単価も動かない。戻せるのは親方だけ');

// ---------------- 現場の状態 ----------------
await as(A, `update sites set status = 'completed' where id = $1`, [site]);
assert.notEqual((await as(A, 'select completed_at from sites where id=$1', [site]))[0].completed_at, null);
await as(A, `update sites set status = 'archived' where id = $1`, [site]);
await fails(B, `insert into messages (site_id, user_id, body) values ($1, $2, 'x')`, [site, B]);
assert.equal((await as(B, 'select * from messages')).length, 2);
assert.equal((await as(B, 'select * from attendances')).length, 2);
await as(A, `update sites set status = 'active' where id = $1`, [site]);
const [reopened] = await as(A, 'select * from sites where id=$1', [site]);
assert.equal(reopened.archived_at, null);
assert.equal(reopened.completed_at, null);
ok('アーカイブ後は書けないが、チャットと出面は見える。再開できる');

// ---------------- 納期超過 ----------------
await sys(`update sites set due_date = (now() at time zone 'Asia/Tokyo')::date - 1, start_date = '2026-01-01' where id = $1`, [site]);
assert.equal((await sys('select notify_overdue_sites() as n'))[0].n, 1);
assert.equal((await sys('select notify_overdue_sites() as n'))[0].n, 0);
assert.equal((await as(A, `select * from notifications where type = 'due_over'`)).length, 1);
await fails(A, 'select notify_overdue_sites()');
ok('納期超過は管理者に1回だけ知らせる（端末からは呼べない）');

// ---------------- 親方交代・退会 ----------------
assert.match(await fails(A, 'select delete_account()'), /親方/);
await fails(B, 'select transfer_team_ownership($1, $2)', [team, B]);
await fails(A, 'select transfer_team_ownership($1, $2)', [team, C]);
await as(A, 'select transfer_team_ownership($1, $2)', [team, B]);
assert.equal((await as(B, 'select owner_user_id from teams'))[0].owner_user_id, B);
assert.equal((await as(A, 'select role from team_members where user_id=$1', [A]))[0].role, 'member');
ok('親方を渡せる（チームの人にだけ）。親方のままでは退会できない');

await as(D, 'select delete_account()');
const [gone] = await sys('select * from public.users where id = $1', [D]);
assert.equal(gone.display_name, '退会した人');
assert.equal((await sys('select * from auth.users where id = $1', [D])).length, 0);
assert.equal((await as(B, 'select * from team_members where user_id = $1', [D])).length, 0);
assert.equal((await as(B, 'select * from schedule_replies')).length, 1);
ok('退会すると名前が消え、名簿から外れる。仲間の記録は残る');

// ---------------- 人工の計算が端末と同じか ----------------
const rules = [
  { kind: 'hourly', hoursPerNinku: 8 },
  { kind: 'hourly', hoursPerNinku: 6 },
  { kind: 'fixed', addNinku: 0.5 },
  { kind: 'none' },
];
for (const rule of rules) {
  for (const unit of [1.0, 0.5]) {
    for (const hours of [0, 0.5, 1, 2, 3, 4.5]) {
      const [{ n }] = await sys('select compute_ninku($1, $2, $3) as n', [unit, hours, JSON.stringify(rule)]);
      assert.equal(Number(n), computeNinku(unit, hours, rule), `${JSON.stringify(rule)} ${unit} ${hours}`);
    }
  }
}
ok('サーバーの人工計算が src/lib/ninku.ts と一致する');

console.log('all DB checks passed');
