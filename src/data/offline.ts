/**
 * 出面だけは電波がなくても記録できるようにする（要件定義書の仮方針「オフライン対応は出面入力のみ」）。
 * 送れなかった出面は端末にためておき、つながったら順に送る。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import type { AttendanceInput } from '@/data/api';
import { api } from '@/data/client';

const KEY = 'ninkuru.offlineAttendances';

export type QueuedAttendance = { input: AttendanceInput; enteredBy: string; queuedAt: string };

let items: QueuedAttendance[] = [];
let loaded = false;
let flushing = false;
/** 送ろうとして断られた（権限・確定済みなど）ときの理由。画面で知らせる */
let lastRejected: string | null = null;
const listeners = new Set<() => void>();

const sameKey = (a: AttendanceInput, b: AttendanceInput) =>
  a.siteId === b.siteId && a.userId === b.userId && a.workDate === b.workDate;

function emit() {
  listeners.forEach((l) => l());
}

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    items = raw ? (JSON.parse(raw) as QueuedAttendance[]) : [];
  } catch {
    items = [];
  }
  emit();
}

async function persist() {
  emit();
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // 保存できなくても、アプリを閉じるまではメモリに残る
  }
}

export function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /network request failed|failed to fetch|fetch failed|networkerror|load failed|timed? ?out/i.test(msg);
}

/** 出面を送る。電波がなければためておく */
export async function saveAttendance(input: AttendanceInput, enteredBy: string): Promise<'sent' | 'queued'> {
  await load();
  try {
    await api.upsertAttendance(input, enteredBy);
    items = items.filter((q) => !sameKey(q.input, input));
    await persist();
    void flushQueue();
    return 'sent';
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    items = [...items.filter((q) => !sameKey(q.input, input)), { input, enteredBy, queuedAt: new Date().toISOString() }];
    await persist();
    return 'queued';
  }
}

/** たまっている出面を送る。送れた件数を返す */
export async function flushQueue(): Promise<number> {
  await load();
  if (flushing || items.length === 0) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const q of [...items]) {
      try {
        await api.upsertAttendance(q.input, q.enteredBy);
        sent++;
      } catch (e) {
        if (isNetworkError(e)) break;
        // 確定済みなど、送っても通らないものは捨てて理由を残す
        lastRejected = e instanceof Error ? e.message : String(e);
      }
      items = items.filter((x) => x !== q);
      await persist();
    }
  } finally {
    flushing = false;
  }
  return sent;
}

export function takeRejectedReason(): string | null {
  const r = lastRejected;
  lastRejected = null;
  return r;
}

function subscribe(l: () => void) {
  listeners.add(l);
  void load();
  return () => listeners.delete(l);
}

export function useQueuedAttendances(): QueuedAttendance[] {
  return useSyncExternalStore(subscribe, () => items, () => items);
}
