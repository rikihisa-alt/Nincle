-- 毎朝 8:00（日本時間）に、納期を過ぎた現場の管理者へ知らせる
-- Supabase ダッシュボード → Database → Extensions で pg_cron が有効になっていること
create extension if not exists pg_cron;

select cron.schedule('ninkuru-overdue-sites', '0 23 * * *', 'select public.notify_overdue_sites()');
