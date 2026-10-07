-- ニンクル 機能追加
-- 締め（確定）、通知、写真、退会、親方の交代、仲間の空き、未読数、人工のサーバー側計算

-- ============================================================
-- users：退会しても過去の出面・チャットは残す（名前だけ「退会した人」にする）
-- ============================================================
alter table public.users drop constraint users_id_fkey;
alter table public.users
  add column deleted_at timestamptz,
  add column notify_schedule_request boolean not null default true,
  add column notify_schedule_confirmed boolean not null default true,
  add column notify_due boolean not null default true,
  add column notify_chat boolean not null default true;

-- プッシュ通知の宛先（端末ごと）
create table public.push_tokens (
  token text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now()
);
create index on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
create policy push_tokens_select on public.push_tokens for select to authenticated using (user_id = auth.uid());
create policy push_tokens_insert on public.push_tokens for insert to authenticated with check (user_id = auth.uid());
create policy push_tokens_update on public.push_tokens for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_tokens_delete on public.push_tokens for delete to authenticated using (user_id = auth.uid());

-- ============================================================
-- 現場・予定の列追加
-- ============================================================
alter table public.sites
  add column memo text check (char_length(memo) <= 1000),
  add column completed_at timestamptz,
  add column archived_at timestamptz,
  -- 納期超過の通知を、どの納期に対して出したか（納期を延ばしたらまた出す）
  add column due_notified_for date;

alter table public.schedule_requests
  add column last_nudged_at timestamptz,
  add column confirmed_at timestamptz;

alter table public.assignments
  add column request_id uuid references public.schedule_requests (id) on delete set null,
  add column meet_time text check (char_length(meet_time) <= 10),
  add column note text check (char_length(note) <= 200);

-- 状態が変わった日時を残す
create function public.sites_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    new.completed_at := case when new.status = 'completed' then now() when new.status = 'active' then null else old.completed_at end;
    new.archived_at := case when new.status = 'archived' then now() else null end;
  end if;
  return new;
end;
$$;
create trigger sites_before_update before update on public.sites
  for each row execute function public.sites_before_update();

-- ============================================================
-- 人工の計算（サーバー側）
-- src/lib/ninku.ts と同じ規則。端末から送られた値は信用せず、ここで計算し直す。
-- 一致していることは supabase/tests/rls.test.mjs で確かめている。
-- ============================================================
create function public.compute_ninku(p_unit numeric, p_overtime_hours numeric, p_rule jsonb) returns numeric
language sql immutable set search_path = '' as $$
  select round(
    p_unit + case
      when p_overtime_hours <= 0 then 0
      when p_rule ->> 'kind' = 'hourly' then p_overtime_hours / nullif((p_rule ->> 'hoursPerNinku')::numeric, 0)
      when p_rule ->> 'kind' = 'fixed' then (p_rule ->> 'addNinku')::numeric
      else 0
    end,
    3
  );
$$;

-- 出面の単価は入力時点の値を持つ（未確定の月は単価を変えたら付け替える）
alter table public.attendances add column unit_price integer not null default 0 check (unit_price >= 0);

create function public.current_unit_price(p_site_id uuid, p_user_id uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(m.unit_price, s.default_unit_price)
  from public.sites s
  left join public.site_members m on m.site_id = s.id and m.user_id = p_user_id
  where s.id = p_site_id;
$$;

-- ============================================================
-- 締め（確定）
-- ============================================================
create table public.closings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  closed_by uuid references public.users (id),
  closed_at timestamptz not null default now(),
  unique (team_id, period_start),
  check (period_start <= period_end)
);
alter table public.closings enable row level security;
create policy closings_select on public.closings for select to authenticated using (public.is_team_member(team_id));
-- 確定と取り消しは close_period / reopen_period（親方だけ）

create function public.is_date_closed(p_site_id uuid, p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.closings c
    join public.sites s on s.team_id = c.team_id
    where s.id = p_site_id and p_date between c.period_start and c.period_end
  );
$$;

-- 出面の書き込み前チェックを作り直す：確定済みの月は直せない、人工と単価はサーバーで決める
create or replace function public.attendances_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_rule jsonb;
  v_changed boolean;
begin
  if tg_op = 'DELETE' then
    if public.is_date_closed(old.site_id, old.work_date) then
      raise exception '確定済みの月の出面は消せません。親方に確定を戻してもらってください' using errcode = '42501';
    end if;
    return old;
  end if;

  if public.is_date_closed(new.site_id, new.work_date)
     or (tg_op = 'UPDATE' and public.is_date_closed(old.site_id, old.work_date)) then
    raise exception '確定済みの月の出面は直せません。親方に確定を戻してもらってください' using errcode = '42501';
  end if;

  v_changed := tg_op = 'INSERT' or new.unit is distinct from old.unit or new.overtime_hours is distinct from old.overtime_hours;

  select overtime_rule into v_rule from public.sites where id = new.site_id;
  if v_changed then
    new.computed_ninku := public.compute_ninku(new.unit, new.overtime_hours, v_rule);
    new.entered_by := auth.uid();
  else
    new.computed_ninku := old.computed_ninku;
  end if;
  if tg_op = 'INSERT' then
    new.unit_price := public.current_unit_price(new.site_id, new.user_id);
  else
    new.updated_at := now();
  end if;

  if public.is_site_admin(new.site_id) then
    -- 管理者が入れた・直した出面は、そのまま承認済みにする
    if v_changed then
      new.approved_at := now();
      new.approved_by := auth.uid();
    elsif new.approved_at is distinct from old.approved_at then
      new.approved_by := case when new.approved_at is null then null else auth.uid() end;
    end if;
  elsif v_changed then
    -- 本人が入れた・直した出面は承認待ち
    new.approved_at := null;
    new.approved_by := null;
  else
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
  end if;
  return new;
end;
$$;

drop trigger attendances_before_write on public.attendances;
create trigger attendances_before_write
  before insert or update or delete on public.attendances
  for each row execute function public.attendances_before_write();

-- 履歴は中身（区分・残業・人工・承認）が変わったときだけ残す。単価の付け替えでは残さない
create or replace function public.attendances_log_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE'
     and new.unit is not distinct from old.unit
     and new.overtime_hours is not distinct from old.overtime_hours
     and new.computed_ninku is not distinct from old.computed_ninku
     and new.approved_at is not distinct from old.approved_at then
    return null;
  end if;
  insert into public.attendance_histories
    (attendance_id, site_id, user_id, work_date, unit, overtime_hours, computed_ninku, approved_at, operation, changed_by)
  values
    (old.id, old.site_id, old.user_id, old.work_date, old.unit, old.overtime_hours, old.computed_ninku, old.approved_at,
     lower(tg_op), auth.uid());
  return null;
end;
$$;

-- 単価を変えたら、確定していない月の出面に付け替える
create function public.reprice_open_attendances() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'sites' then
    if new.default_unit_price is distinct from old.default_unit_price then
      update public.attendances a
      set unit_price = public.current_unit_price(a.site_id, a.user_id)
      where a.site_id = new.id and not public.is_date_closed(a.site_id, a.work_date);
    end if;
  elsif new.unit_price is distinct from old.unit_price then
    update public.attendances a
    set unit_price = public.current_unit_price(a.site_id, a.user_id)
    where a.site_id = new.site_id and a.user_id = new.user_id and not public.is_date_closed(a.site_id, a.work_date);
  end if;
  return null;
end;
$$;
create trigger sites_reprice after update on public.sites
  for each row execute function public.reprice_open_attendances();
create trigger site_members_reprice after update on public.site_members
  for each row execute function public.reprice_open_attendances();

create function public.close_period(p_team_id uuid, p_start date, p_end date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.is_team_owner(p_team_id) then
    raise exception '確定できるのは親方だけです' using errcode = '42501';
  end if;
  insert into public.closings (team_id, period_start, period_end, closed_by)
  values (p_team_id, p_start, p_end, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create function public.reopen_period(p_closing_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.closings c where c.id = p_closing_id and public.is_team_owner(c.team_id)) then
    raise exception '確定を戻せるのは親方だけです' using errcode = '42501';
  end if;
  delete from public.closings where id = p_closing_id;
end;
$$;

-- ============================================================
-- 通知
-- payload に title / body を入れておき、プッシュ送信（supabase/functions/send-push）はそれを送るだけにする
-- ============================================================
create function public.notify_user(p_user_id uuid, p_type text, p_payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user public.users;
begin
  select * into v_user from public.users where id = p_user_id;
  if v_user.id is null or v_user.deleted_at is not null then return; end if;
  if (p_type in ('schedule_request', 'nudge') and not v_user.notify_schedule_request)
     or (p_type = 'assignment' and not v_user.notify_schedule_confirmed)
     or (p_type = 'due_over' and not v_user.notify_due)
     or (p_type = 'message' and not v_user.notify_chat) then
    return;
  end if;
  insert into public.notifications (user_id, type, payload) values (p_user_id, p_type, p_payload);
end;
$$;

create function public.jp_date(p_date date) returns text
language sql immutable set search_path = '' as $$
  select extract(month from p_date)::int || '/' || extract(day from p_date)::int
    || '（' || (array['日','月','火','水','木','金','土'])[extract(dow from p_date)::int + 1] || '）';
$$;

-- 予定の確認が出たら、出した人以外の現場メンバーに知らせる
create function public.on_schedule_request_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_site public.sites;
  v_member record;
  v_when text;
begin
  select * into v_site from public.sites where id = new.site_id;
  v_when := public.jp_date(new.target_date_from)
    || case when new.target_date_to > new.target_date_from then '〜' || public.jp_date(new.target_date_to) else '' end;
  for v_member in select user_id from public.site_members where site_id = new.site_id and user_id <> new.created_by loop
    perform public.notify_user(v_member.user_id, 'schedule_request', jsonb_build_object(
      'site_id', new.site_id, 'request_id', new.id,
      'title', v_site.name || '：入れる？',
      'body', v_when || coalesce(' ' || new.meet_time || '集合', '') || '。返事してください'
    ));
  end loop;
  return null;
end;
$$;
create trigger on_schedule_request_created after insert on public.schedule_requests
  for each row execute function public.on_schedule_request_created();

-- チャットの書き込みを、書いた人以外の現場メンバーに知らせる
create function public.on_message_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_site_name text;
  v_author text;
  v_member record;
begin
  select name into v_site_name from public.sites where id = new.site_id;
  select display_name into v_author from public.users where id = new.user_id;
  for v_member in select user_id from public.site_members where site_id = new.site_id and user_id <> new.user_id loop
    perform public.notify_user(v_member.user_id, 'message', jsonb_build_object(
      'site_id', new.site_id, 'message_id', new.id,
      'title', v_site_name,
      'body', v_author || '：' || case when new.body = '' then '写真を送りました' else left(new.body, 80) end
    ));
  end loop;
  return null;
end;
$$;
create trigger on_message_created after insert on public.messages
  for each row execute function public.on_message_created();

-- 予定を確定する：選んだ人を、選んだ日に入れる。確認は締め切る
create function public.confirm_schedule(p_request_id uuid, p_user_ids uuid[], p_dates date[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_req public.schedule_requests;
  v_site public.sites;
  v_user uuid;
  v_date date;
  v_count integer := 0;
  v_dates_text text;
begin
  select * into v_req from public.schedule_requests where id = p_request_id;
  if v_req.id is null or not public.is_site_admin(v_req.site_id) then
    raise exception '予定を決められるのは現場の管理者だけです' using errcode = '42501';
  end if;
  select * into v_site from public.sites where id = v_req.site_id;
  if v_site.status = 'archived' then
    raise exception 'アーカイブした現場の予定は決められません' using errcode = '42501';
  end if;

  foreach v_user in array p_user_ids loop
    if not exists (select 1 from public.site_members where site_id = v_req.site_id and user_id = v_user) then
      continue;
    end if;
    foreach v_date in array p_dates loop
      if v_date not between v_req.target_date_from and v_req.target_date_to then continue; end if;
      insert into public.assignments (site_id, user_id, work_date, request_id, meet_time, note)
      values (v_req.site_id, v_user, v_date, v_req.id, v_req.meet_time, left(v_req.note, 200))
      on conflict (site_id, user_id, work_date)
        do update set request_id = excluded.request_id, meet_time = excluded.meet_time, note = excluded.note;
      v_count := v_count + 1;
    end loop;

    select string_agg(public.jp_date(d), '・' order by d) into v_dates_text
    from unnest(p_dates) d where d between v_req.target_date_from and v_req.target_date_to;
    if v_user <> auth.uid() and v_dates_text is not null then
      perform public.notify_user(v_user, 'assignment', jsonb_build_object(
        'site_id', v_req.site_id, 'request_id', v_req.id,
        'title', v_site.name || '：予定が決まりました',
        'body', v_dates_text || coalesce(' ' || v_req.meet_time || '集合', '') || '。カレンダーに入れました'
      ));
    end if;
  end loop;

  update public.schedule_requests set status = 'closed', confirmed_at = now() where id = p_request_id;
  return v_count;
end;
$$;

-- まだ答えていない人をつつく（30分に1回まで）
create function public.nudge_schedule_request(p_request_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_req public.schedule_requests;
  v_site_name text;
  v_member record;
  v_count integer := 0;
begin
  select * into v_req from public.schedule_requests where id = p_request_id;
  if v_req.id is null or not public.is_site_admin(v_req.site_id) then
    raise exception 'つつけるのは現場の管理者だけです' using errcode = '42501';
  end if;
  if v_req.last_nudged_at > now() - interval '30 minutes' then
    raise exception 'さっきつついたばかりです。30分あけてください' using errcode = 'P0001';
  end if;
  select name into v_site_name from public.sites where id = v_req.site_id;
  for v_member in
    select m.user_id from public.site_members m
    where m.site_id = v_req.site_id and m.user_id <> auth.uid()
      and not exists (select 1 from public.schedule_replies r where r.request_id = p_request_id and r.user_id = m.user_id)
  loop
    perform public.notify_user(v_member.user_id, 'nudge', jsonb_build_object(
      'site_id', v_req.site_id, 'request_id', v_req.id,
      'title', v_site_name || '：返事まだです',
      'body', public.jp_date(v_req.target_date_from) || 'に入れるか、返事してください'
    ));
    v_count := v_count + 1;
  end loop;
  update public.schedule_requests set last_nudged_at = now() where id = p_request_id;
  return v_count;
end;
$$;

-- 納期を過ぎた現場の管理者に知らせる（pg_cron で毎朝呼ぶ。20261007000100_cron.sql）
create function public.notify_overdue_sites() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_site public.sites;
  v_admin record;
  v_count integer := 0;
begin
  for v_site in
    select * from public.sites
    where status = 'active' and due_date < v_today and due_notified_for is distinct from due_date
  loop
    for v_admin in select user_id from public.site_members where site_id = v_site.id and role = 'admin' loop
      perform public.notify_user(v_admin.user_id, 'due_over', jsonb_build_object(
        'site_id', v_site.id,
        'title', v_site.name || '：納期を過ぎました',
        'body', '納期を延ばすか、完了にするか決めてください'
      ));
      v_count := v_count + 1;
    end loop;
    update public.sites set due_notified_for = v_site.due_date where id = v_site.id;
  end loop;
  return v_count;
end;
$$;

-- ============================================================
-- 既読・未読
-- ============================================================
create function public.mark_site_read(p_site_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_site_member(p_site_id) then return; end if;
  insert into public.message_reads (site_id, user_id, last_read_at) values (p_site_id, auth.uid(), now())
  on conflict (site_id, user_id) do update set last_read_at = now();
end;
$$;

create function public.my_unread_counts()
returns table (site_id uuid, unread bigint)
language sql stable security definer set search_path = '' as $$
  select m.site_id, count(msg.id)
  from public.site_members m
  left join public.message_reads r on r.site_id = m.site_id and r.user_id = m.user_id
  left join public.messages msg on msg.site_id = m.site_id
    and msg.user_id <> m.user_id
    and msg.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
  where m.user_id = auth.uid()
  group by m.site_id;
$$;

-- ============================================================
-- 仲間の空き：同じチームで「空きを見せる」にしている人の、予定が入っている日だけ返す（現場名は出さない）
-- ============================================================
create function public.team_busy_days(p_team_id uuid, p_from date, p_to date)
returns table (user_id uuid, work_date date)
language sql stable security definer set search_path = '' as $$
  select distinct a.user_id, a.work_date
  from public.assignments a
  join public.team_members tm on tm.user_id = a.user_id and tm.team_id = p_team_id
  join public.users u on u.id = a.user_id and u.calendar_public
  where public.is_team_member(p_team_id) and a.work_date between p_from and p_to;
$$;

-- ============================================================
-- 親方の交代・退会
-- ============================================================
create function public.transfer_team_ownership(p_team_id uuid, p_new_owner uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_team_owner(p_team_id) then
    raise exception '親方を渡せるのは今の親方だけです' using errcode = '42501';
  end if;
  if not exists (select 1 from public.team_members where team_id = p_team_id and user_id = p_new_owner) then
    raise exception 'チームの人にしか渡せません' using errcode = 'P0001';
  end if;
  update public.team_members set role = 'member' where team_id = p_team_id and user_id = auth.uid();
  update public.team_members set role = 'owner' where team_id = p_team_id and user_id = p_new_owner;
  update public.teams set owner_user_id = p_new_owner where id = p_team_id;
end;
$$;

-- 退会。過去の出面とチャットは仲間の記録として残し、名前と連絡先だけ消す
create function public.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'ログインしてください' using errcode = '42501';
  end if;
  if exists (select 1 from public.team_members where user_id = v_uid and role = 'owner') then
    raise exception '親方をしているチームがあります。親方を誰かに渡すか、チームを消してから退会してください'
      using errcode = 'P0001';
  end if;
  delete from public.team_members where user_id = v_uid;
  delete from public.site_members where user_id = v_uid;
  delete from public.push_tokens where user_id = v_uid;
  delete from public.notifications where user_id = v_uid;
  update public.users
  set display_name = '退会した人', phone = null, line_user_id = null, calendar_public = false, deleted_at = now()
  where id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

-- ============================================================
-- 関数の実行権限
-- Postgres は関数を PUBLIC（誰でも）に実行させるので、anon から外すだけでは足りない。
-- いったん PUBLIC から外し、ログインした人に必要なものだけ渡す。
-- ============================================================

-- 内部用（トリガーや cron からだけ呼ぶ）。端末からは呼ばせない
revoke execute on function public.notify_user(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.notify_overdue_sites() from public, anon, authenticated;
revoke execute on function public.current_unit_price(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.is_date_closed(uuid, date) from public, anon, authenticated;

-- ログインした人だけ（20261006000000_init.sql の分もここで締め直す）
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.create_team(text)',
    'public.get_invite_preview(text)',
    'public.accept_invite(text)',
    'public.create_site(uuid, text, text, text, date, date, integer, uuid[])',
    'public.close_period(uuid, date, date)',
    'public.reopen_period(uuid)',
    'public.confirm_schedule(uuid, uuid[], date[])',
    'public.nudge_schedule_request(uuid)',
    'public.mark_site_read(uuid)',
    'public.my_unread_counts()',
    'public.team_busy_days(uuid, date, date)',
    'public.transfer_team_ownership(uuid, uuid)',
    'public.delete_account()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- ============================================================
-- 写真（Storage）。パスは「現場ID/ファイル名」。現場メンバーだけが読み書きできる
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-photos', 'site-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create function public.photo_site_id(p_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

create policy site_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'site-photos' and public.is_site_member(public.photo_site_id(name)));
create policy site_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'site-photos'
    and public.is_site_member(public.photo_site_id(name))
    and public.is_site_writable(public.photo_site_id(name))
  );

-- 通知一覧の既読化とリアルタイム
alter publication supabase_realtime add table public.notifications;
