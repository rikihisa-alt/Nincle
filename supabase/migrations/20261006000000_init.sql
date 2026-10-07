-- ニンクル 初期スキーマ（要件定義書「データモデル」準拠）
-- チームと現場を別テーブルに分け、チャット・予定・出面はすべて現場にぶら下げる。
-- 認可はすべて Row Level Security。所属していない現場のデータは一切取得できない。

-- ============================================================
-- テーブル
-- ============================================================

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 30),
  phone text check (char_length(phone) <= 20),
  trade text check (char_length(trade) <= 20),
  line_user_id text unique,
  -- 空いている日をチーム内に公開するか（個人カレンダー）
  calendar_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  owner_user_id uuid not null references public.users (id),
  -- 締め日。null は月末、数値はその日（例：20）
  closing_day smallint check (closing_day between 1 and 28),
  created_at timestamptz not null default now()
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  unique (team_id, user_id)
);
create index on public.team_members (user_id);

-- 招待リンク。トークンを知っている人だけが accept_invite で参加できる
create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  token text not null unique
    default replace(replace(replace(encode(extensions.gen_random_bytes(12), 'base64'), '+', '-'), '/', '_'), '=', ''),
  created_by uuid not null references public.users (id),
  expires_at timestamptz not null default now() + interval '14 days',
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.team_invites (team_id);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  address text,
  client_name text,
  start_date date not null,
  due_date date not null,
  default_unit_price integer not null default 0 check (default_unit_price >= 0),
  -- src/lib/ninku.ts の OvertimeRule と同じ形。既定は残業8時間で1人工（2時間で0.25人工）
  overtime_rule jsonb not null default '{"kind":"hourly","hoursPerNinku":8}',
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_by uuid not null references public.users (id),
  created_at timestamptz not null default now(),
  check (start_date <= due_date)
);
create index on public.sites (team_id);

create table public.site_members (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  -- 個別単価。null なら現場の既定値
  unit_price integer check (unit_price >= 0),
  created_at timestamptz not null default now(),
  unique (site_id, user_id)
);
create index on public.site_members (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  user_id uuid not null references public.users (id),
  body text not null default '' check (char_length(body) <= 2000),
  image_url text,
  created_at timestamptz not null default now(),
  check (body <> '' or image_url is not null)
);
create index on public.messages (site_id, created_at);

-- 既読
create table public.message_reads (
  site_id uuid not null references public.sites (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (site_id, user_id)
);

create table public.schedule_requests (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  created_by uuid not null references public.users (id),
  target_date_from date not null,
  target_date_to date not null,
  meet_time text check (char_length(meet_time) <= 10),
  note text check (char_length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  check (target_date_from <= target_date_to)
);
create index on public.schedule_requests (site_id);

create table public.schedule_replies (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.schedule_requests (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  answer text not null check (answer in ('yes', 'no', 'unknown')),
  replied_at timestamptz not null default now(),
  unique (request_id, user_id)
);

-- 確定予定
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  work_date date not null,
  created_at timestamptz not null default now(),
  unique (site_id, user_id, work_date)
);
create index on public.assignments (user_id, work_date);

-- 出面
create table public.attendances (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  work_date date not null,
  unit numeric(2, 1) not null check (unit in (1.0, 0.5)),
  overtime_hours numeric(4, 2) not null default 0 check (overtime_hours between 0 and 24),
  -- 入力時点の換算ルールで計算した人工。ルールが後で変わっても値を残す
  computed_ninku numeric(6, 3) not null check (computed_ninku >= 0),
  entered_by uuid not null references public.users (id),
  approved_at timestamptz,
  approved_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, user_id, work_date)
);
create index on public.attendances (site_id, work_date);
create index on public.attendances (user_id, work_date);

-- 出面の修正履歴（更新・削除のたびに変更前の値を残す）
create table public.attendance_histories (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null,
  site_id uuid not null references public.sites (id) on delete cascade,
  user_id uuid not null,
  work_date date not null,
  unit numeric(2, 1) not null,
  overtime_hours numeric(4, 2) not null,
  computed_ninku numeric(6, 3) not null,
  approved_at timestamptz,
  operation text not null check (operation in ('update', 'delete')),
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index on public.attendance_histories (attendance_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

-- ============================================================
-- 認可ヘルパー（RLS から呼ぶ。security definer で RLS の再帰を避ける）
-- ============================================================

create function public.is_team_member(p_team_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team_id and user_id = auth.uid()
  );
$$;

create function public.is_team_owner(p_team_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team_id and user_id = auth.uid() and role = 'owner'
  );
$$;

create function public.is_site_member(p_site_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.site_members
    where site_id = p_site_id and user_id = auth.uid()
  );
$$;

create function public.is_site_admin(p_site_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.site_members
    where site_id = p_site_id and user_id = auth.uid() and role = 'admin'
  );
$$;

-- アーカイブ済みの現場は閲覧専用
create function public.is_site_writable(p_site_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sites where id = p_site_id and status <> 'archived');
$$;

create function public.shares_team_with(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.team_members a
    join public.team_members b on a.team_id = b.team_id
    where a.user_id = auth.uid() and b.user_id = p_user_id
  );
$$;

-- ============================================================
-- トリガー
-- ============================================================

-- auth.users に登録されたらプロフィール行を作る
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 出面：承認は管理者だけ、更新日時の付け替え
create function public.attendances_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.entered_by := auth.uid();
  end if;
  if not public.is_site_admin(new.site_id) then
    if tg_op = 'INSERT' then
      new.approved_at := null;
      new.approved_by := null;
    else
      new.approved_at := old.approved_at;
      new.approved_by := old.approved_by;
    end if;
  elsif new.approved_at is not null and (tg_op = 'INSERT' or old.approved_at is null) then
    new.approved_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger attendances_before_write
  before insert or update on public.attendances
  for each row execute function public.attendances_before_write();

-- 出面：修正履歴を残す
create function public.attendances_log_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.attendance_histories
    (attendance_id, site_id, user_id, work_date, unit, overtime_hours, computed_ninku, approved_at, operation, changed_by)
  values
    (old.id, old.site_id, old.user_id, old.work_date, old.unit, old.overtime_hours, old.computed_ninku, old.approved_at,
     lower(tg_op), auth.uid());
  return null;
end;
$$;

create trigger attendances_log_history
  after update or delete on public.attendances
  for each row execute function public.attendances_log_history();

-- ============================================================
-- RPC（複数テーブルをまとめて書く操作）
-- ============================================================

-- チームを作り、作った人を owner として登録する
create function public.create_team(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_team_id uuid;
begin
  if auth.uid() is null then
    raise exception 'ログインしてください' using errcode = '42501';
  end if;
  insert into public.teams (name, owner_user_id) values (trim(p_name), auth.uid()) returning id into v_team_id;
  insert into public.team_members (team_id, user_id, role) values (v_team_id, auth.uid(), 'owner');
  return v_team_id;
end;
$$;

-- 招待リンクを開いた人に、どのチームか見せる（参加前なので RLS では読めない）
create function public.get_invite_preview(p_token text)
returns table (team_id uuid, team_name text, owner_name text, member_count bigint, already_member boolean)
language sql stable security definer set search_path = '' as $$
  select t.id, t.name, u.display_name,
         (select count(*) from public.team_members m where m.team_id = t.id),
         exists (select 1 from public.team_members m where m.team_id = t.id and m.user_id = auth.uid())
  from public.team_invites i
  join public.teams t on t.id = i.team_id
  join public.users u on u.id = t.owner_user_id
  where i.token = p_token and i.revoked_at is null and i.expires_at > now();
$$;

-- 招待リンクで参加する
create function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_team_id uuid;
begin
  if auth.uid() is null then
    raise exception 'ログインしてください' using errcode = '42501';
  end if;
  select team_id into v_team_id
  from public.team_invites
  where token = p_token and revoked_at is null and expires_at > now();
  if v_team_id is null then
    raise exception '招待リンクが切れとるか、間違うとります' using errcode = 'P0002';
  end if;
  insert into public.team_members (team_id, user_id, role)
  values (v_team_id, auth.uid(), 'member')
  on conflict (team_id, user_id) do nothing;
  return v_team_id;
end;
$$;

-- 現場を作り、作った人を admin、選んだチームメンバーを member として入れる
create function public.create_site(
  p_team_id uuid,
  p_name text,
  p_address text,
  p_client_name text,
  p_start_date date,
  p_due_date date,
  p_default_unit_price integer,
  p_member_ids uuid[] default '{}'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_site_id uuid;
begin
  if not public.is_team_member(p_team_id) then
    raise exception 'このチームの人しか現場を作れません' using errcode = '42501';
  end if;
  insert into public.sites (team_id, name, address, client_name, start_date, due_date, default_unit_price, created_by)
  values (p_team_id, trim(p_name), p_address, p_client_name, p_start_date, p_due_date, p_default_unit_price, auth.uid())
  returning id into v_site_id;

  insert into public.site_members (site_id, user_id, role) values (v_site_id, auth.uid(), 'admin');

  insert into public.site_members (site_id, user_id, role)
  select v_site_id, m.user_id, 'member'
  from public.team_members m
  where m.team_id = p_team_id and m.user_id = any (p_member_ids) and m.user_id <> auth.uid()
  on conflict (site_id, user_id) do nothing;

  return v_site_id;
end;
$$;

revoke execute on function public.create_team(text) from anon;
revoke execute on function public.get_invite_preview(text) from anon;
revoke execute on function public.accept_invite(text) from anon;
revoke execute on function public.create_site(uuid, text, text, text, date, date, integer, uuid[]) from anon;

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.users enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
alter table public.sites enable row level security;
alter table public.site_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;
alter table public.schedule_requests enable row level security;
alter table public.schedule_replies enable row level security;
alter table public.assignments enable row level security;
alter table public.attendances enable row level security;
alter table public.attendance_histories enable row level security;
alter table public.notifications enable row level security;

-- users：自分と、同じチームの仲間だけ見える。書けるのは自分だけ
create policy users_select on public.users for select to authenticated
  using (id = auth.uid() or public.shares_team_with(id));
create policy users_update on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- teams：作成は create_team 経由。名前変更・削除は owner
create policy teams_select on public.teams for select to authenticated
  using (public.is_team_member(id));
create policy teams_update on public.teams for update to authenticated
  using (public.is_team_owner(id)) with check (owner_user_id = auth.uid());
create policy teams_delete on public.teams for delete to authenticated
  using (public.is_team_owner(id));

-- team_members：追加は accept_invite 経由。削除は owner（owner 自身は消せない）か本人の脱退
create policy team_members_select on public.team_members for select to authenticated
  using (public.is_team_member(team_id));
create policy team_members_delete on public.team_members for delete to authenticated
  using (role <> 'owner' and (public.is_team_owner(team_id) or user_id = auth.uid()));

-- team_invites：owner だけが発行・取り消し
create policy team_invites_select on public.team_invites for select to authenticated
  using (public.is_team_owner(team_id));
create policy team_invites_insert on public.team_invites for insert to authenticated
  with check (public.is_team_owner(team_id) and created_by = auth.uid());
create policy team_invites_update on public.team_invites for update to authenticated
  using (public.is_team_owner(team_id)) with check (public.is_team_owner(team_id));

-- sites：作成は create_site 経由。見えるのは現場メンバーだけ、変更は admin
create policy sites_select on public.sites for select to authenticated
  using (public.is_site_member(id));
create policy sites_update on public.sites for update to authenticated
  using (public.is_site_admin(id)) with check (public.is_site_admin(id));

-- site_members：招待・単価設定・外すのは admin。入れられるのは同じチームの人だけ
create policy site_members_select on public.site_members for select to authenticated
  using (public.is_site_member(site_id));
create policy site_members_insert on public.site_members for insert to authenticated
  with check (
    public.is_site_admin(site_id)
    and exists (
      select 1 from public.sites s
      join public.team_members m on m.team_id = s.team_id
      where s.id = site_id and m.user_id = site_members.user_id
    )
  );
create policy site_members_update on public.site_members for update to authenticated
  using (public.is_site_admin(site_id)) with check (public.is_site_admin(site_id));
create policy site_members_delete on public.site_members for delete to authenticated
  using (public.is_site_admin(site_id) and user_id <> auth.uid());

-- messages：現場メンバーが読み書き。アーカイブ後は読むだけ
create policy messages_select on public.messages for select to authenticated
  using (public.is_site_member(site_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (user_id = auth.uid() and public.is_site_member(site_id) and public.is_site_writable(site_id));

create policy message_reads_select on public.message_reads for select to authenticated
  using (public.is_site_member(site_id));
create policy message_reads_insert on public.message_reads for insert to authenticated
  with check (user_id = auth.uid() and public.is_site_member(site_id));
create policy message_reads_update on public.message_reads for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- schedule_requests：確認を出すのは admin
create policy schedule_requests_select on public.schedule_requests for select to authenticated
  using (public.is_site_member(site_id));
create policy schedule_requests_insert on public.schedule_requests for insert to authenticated
  with check (created_by = auth.uid() and public.is_site_admin(site_id) and public.is_site_writable(site_id));
create policy schedule_requests_update on public.schedule_requests for update to authenticated
  using (public.is_site_admin(site_id)) with check (public.is_site_admin(site_id));

-- schedule_replies：本人が回答。締め切った確認には答えられない
create policy schedule_replies_select on public.schedule_replies for select to authenticated
  using (exists (
    select 1 from public.schedule_requests r
    where r.id = request_id and public.is_site_member(r.site_id)
  ));
create policy schedule_replies_insert on public.schedule_replies for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.schedule_requests r
    where r.id = request_id and r.status = 'open' and public.is_site_member(r.site_id)
  ));
create policy schedule_replies_update on public.schedule_replies for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (
    select 1 from public.schedule_requests r
    where r.id = request_id and r.status = 'open'
  ));

-- assignments：確定は admin
create policy assignments_select on public.assignments for select to authenticated
  using (public.is_site_member(site_id));
create policy assignments_insert on public.assignments for insert to authenticated
  with check (public.is_site_admin(site_id) and public.is_site_writable(site_id));
create policy assignments_delete on public.assignments for delete to authenticated
  using (public.is_site_admin(site_id));

-- attendances：本人は自分の分、admin は全員分（代理入力・修正・承認）
create policy attendances_select on public.attendances for select to authenticated
  using (user_id = auth.uid() or public.is_site_admin(site_id));
create policy attendances_insert on public.attendances for insert to authenticated
  with check (
    entered_by = auth.uid()
    and public.is_site_writable(site_id)
    and public.is_site_member(site_id)
    and (user_id = auth.uid() or public.is_site_admin(site_id))
  );
create policy attendances_update on public.attendances for update to authenticated
  using (
    public.is_site_writable(site_id)
    and (public.is_site_admin(site_id) or (user_id = auth.uid() and approved_at is null))
  )
  with check (public.is_site_admin(site_id) or user_id = auth.uid());
create policy attendances_delete on public.attendances for delete to authenticated
  using (
    public.is_site_writable(site_id)
    and (public.is_site_admin(site_id) or (user_id = auth.uid() and approved_at is null))
  );

create policy attendance_histories_select on public.attendance_histories for select to authenticated
  using (user_id = auth.uid() or public.is_site_admin(site_id));

-- notifications：自分宛てだけ
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- Realtime（現場チャット）
-- ============================================================
alter publication supabase_realtime add table public.messages;
