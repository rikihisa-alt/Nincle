import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';

import { api, demoApi } from '@/data/client';
import { supabase } from '@/lib/supabase';
import type { UserRow } from '@/lib/types';

type AuthState = {
  /** セッションとプロフィールの読み込み中 */
  loading: boolean;
  /** デモ表示（Supabase 未設定） */
  isDemo: boolean;
  userId: string | null;
  profile: UserRow | null;
  /** 表示名と職種が入っていれば登録済み */
  profileComplete: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  /** デモ用：誰として見るかを切り替える */
  switchDemoUser: (userId: string) => void;
};

const AuthContext = createContext<AuthState | null>(null);

const PENDING_INVITE_KEY = 'ninkuru.pendingInvite';

/** ログイン前に招待リンクを開いたとき、ログイン後に戻ってこられるよう覚えておく */
export const pendingInvite = {
  save: (token: string) => AsyncStorage.setItem(PENDING_INVITE_KEY, token),
  take: async () => {
    const token = await AsyncStorage.getItem(PENDING_INVITE_KEY);
    if (token) await AsyncStorage.removeItem(PENDING_INVITE_KEY);
    return token;
  },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const isDemo = demoApi !== null;
  const [sessionLoaded, setSessionLoaded] = useState(isDemo);
  const [userId, setUserId] = useState<string | null>(demoApi?.currentUserId() ?? null);
  const [profile, setProfile] = useState<UserRow | null>(null);
  const [profileLoadedFor, setProfileLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setSessionLoaded(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const fetchProfile = useCallback((id: string) => api.getProfile(id).catch(() => null), []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchProfile(userId).then((row) => {
      if (cancelled) return;
      setProfile(row);
      setProfileLoadedFor(userId);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, fetchProfile]);

  // 別のユーザーの古いプロフィールを見せないよう、今のセッションのものだけ使う
  const currentProfile = profile && profile.id === userId ? profile : null;
  const loading = !sessionLoaded || (userId !== null && profileLoadedFor !== userId);

  const value: AuthState = {
    loading,
    isDemo,
    userId,
    profile: currentProfile,
    profileComplete: Boolean(currentProfile?.display_name && currentProfile?.trade),
    refreshProfile: async () => {
      if (!userId) return;
      setProfile(await fetchProfile(userId));
    },
    signOut: async () => {
      queryClient.clear();
      await supabase?.auth.signOut();
    },
    switchDemoUser: (id) => {
      if (!demoApi) return;
      demoApi.setCurrentUser(id);
      queryClient.clear();
      setUserId(id);
    },
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth は AuthProvider の中で使う');
  return ctx;
}

/** ログイン済みの画面で使う。自分の ID を必ず返す */
export function useMe(): { userId: string; profile: UserRow | null; isDemo: boolean } {
  const { userId, profile, isDemo } = useAuth();
  if (!userId) throw new Error('ログインしていません');
  return { userId, profile, isDemo };
}
