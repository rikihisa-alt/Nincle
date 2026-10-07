import type { Api } from '@/data/api';
import { createDemoApi, type DemoApi } from '@/data/demo-api';
import { createSupabaseApi } from '@/data/supabase-api';
import { supabase } from '@/lib/supabase';

/** アプリ全体で1つ。Supabase が未設定ならデモ版 */
export const api: Api = supabase ? createSupabaseApi(supabase) : createDemoApi();

export const demoApi: DemoApi | null = api.kind === 'demo' ? (api as DemoApi) : null;
