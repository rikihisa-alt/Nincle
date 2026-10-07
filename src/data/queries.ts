/**
 * 画面から使う読み込み・書き込みのフック。
 * 書き込んだら全部の読み込みをやり直す（小さなアプリなので、取りこぼしのない単純なやり方にしている）。
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import type { DateRange } from '@/data/api';
import { api } from '@/data/client';
import { toMessage } from '@/lib/errors';
import { useMe } from '@/providers/auth';
import { useToast } from '@/providers/toast';

export function useMySites() {
  const { userId } = useMe();
  return useQuery({ queryKey: ['sites', userId], queryFn: () => api.listMySites(userId) });
}

export function useSite(siteId: string | undefined) {
  const { userId } = useMe();
  return useQuery({
    queryKey: ['site', siteId, userId],
    queryFn: () => api.getSite(siteId!, userId),
    enabled: Boolean(siteId),
  });
}

export function useMyTeams() {
  const { userId } = useMe();
  return useQuery({ queryKey: ['teams', userId], queryFn: () => api.listMyTeams(userId) });
}

export function useTeam(teamId: string | undefined | null) {
  return useQuery({ queryKey: ['team', teamId], queryFn: () => api.getTeam(teamId!), enabled: Boolean(teamId) });
}

export function useClosings(teamId: string | undefined | null) {
  return useQuery({ queryKey: ['closings', teamId], queryFn: () => api.listClosings(teamId!), enabled: Boolean(teamId) });
}

export function useBusyDays(teamId: string | undefined | null, range: DateRange) {
  return useQuery({
    queryKey: ['busy', teamId, range.from, range.to],
    queryFn: () => api.teamBusyDays(teamId!, range),
    enabled: Boolean(teamId),
  });
}

/** 現場のやりとり。新しい書き込みが来たら読み直す */
export function useMessages(siteId: string) {
  const qc = useQueryClient();
  useEffect(
    () =>
      api.subscribeSite(siteId, () => {
        qc.invalidateQueries({ queryKey: ['messages', siteId] });
        qc.invalidateQueries({ queryKey: ['sites'] });
      }),
    [siteId, qc],
  );
  return useQuery({ queryKey: ['messages', siteId], queryFn: () => api.listMessages(siteId), refetchInterval: 60000 });
}

export function useReads(siteId: string) {
  return useQuery({ queryKey: ['reads', siteId], queryFn: () => api.listReads(siteId), refetchInterval: 30000 });
}

export function usePhotoUrls(paths: string[]) {
  return useQuery({
    queryKey: ['photos', paths],
    queryFn: () => api.photoUrls(paths),
    enabled: paths.length > 0,
    staleTime: 50 * 60000,
  });
}

export function useRequests(siteId: string) {
  return useQuery({ queryKey: ['requests', siteId], queryFn: () => api.listRequests(siteId) });
}

export function useMyPendingRequests() {
  const { userId } = useMe();
  return useQuery({ queryKey: ['pendingRequests', userId], queryFn: () => api.listMyPendingRequests(userId) });
}

export function useAssignments(filter: DateRange & { userId?: string; siteIds?: string[] }, enabled = true) {
  return useQuery({
    queryKey: ['assignments', filter],
    queryFn: () => api.listAssignments(filter),
    enabled: enabled && (!filter.siteIds || filter.siteIds.length > 0),
  });
}

export function useAttendances(filter: DateRange & { userId?: string; siteIds?: string[] }, enabled = true) {
  return useQuery({
    queryKey: ['attendances', filter],
    queryFn: () => api.listAttendances(filter),
    enabled: enabled && (!filter.siteIds || filter.siteIds.length > 0),
  });
}

export function useAttendanceHistory(attendanceId: string | null) {
  return useQuery({
    queryKey: ['history', attendanceId],
    queryFn: () => api.listAttendanceHistory(attendanceId!),
    enabled: Boolean(attendanceId),
  });
}

export function useUsers(ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  return useQuery({ queryKey: ['users', sorted], queryFn: () => api.listUsers(sorted), enabled: sorted.length > 0 });
}

export function useNotifications() {
  const { userId } = useMe();
  return useQuery({ queryKey: ['notifications', userId], queryFn: () => api.listNotifications(userId) });
}

/**
 * 書き込み操作をまとめて扱う：実行中フラグ、成功・失敗の知らせ、読み直し。
 * 失敗したら undefined を返す。
 */
export function useAction() {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string | ((r: T) => string | null)): Promise<T | undefined> => {
      setBusy(true);
      try {
        const result = await fn();
        await qc.invalidateQueries();
        const message = typeof success === 'function' ? success(result) : success;
        if (message) toast(message, 'ok');
        return result;
      } catch (e) {
        toast(toMessage(e), 'error');
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [qc, toast],
  );

  return { run, busy };
}
