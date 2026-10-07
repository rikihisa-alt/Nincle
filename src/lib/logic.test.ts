/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { attendanceCsvRows, summarize } from './aggregate.ts';
import {
  addDays,
  daysBetween,
  dueState,
  eachDay,
  formatRange,
  formatStamp,
  isValidYmd,
  monthGrid,
  relativeDay,
  shiftMonth,
  todayJst,
  weekday,
} from './date.ts';
import { periodContaining, periodOf, shiftPeriod } from './period.ts';
import type { AttendanceRow } from './types.ts';

test('日本時間の今日：UTC 15:00 を過ぎたら翌日', () => {
  assert.equal(todayJst(new Date('2026-10-05T14:59:00Z')), '2026-10-05');
  assert.equal(todayJst(new Date('2026-10-05T15:00:00Z')), '2026-10-06');
});

test('日付の計算', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-10-06', '2026-10-09'), 3);
  assert.deepEqual(eachDay('2026-10-08', '2026-10-10'), ['2026-10-08', '2026-10-09', '2026-10-10']);
  assert.equal(weekday('2026-10-06'), '火');
  assert.equal(weekday('2026-10-08'), '木');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(isValidYmd('2026-02-30'), false);
  assert.equal(isValidYmd('2026-02-28'), true);
});

test('表示', () => {
  assert.equal(relativeDay('2026-10-07', '2026-10-06'), '明日 10/7（水）');
  assert.equal(formatRange('2026-10-08', '2026-10-09'), '10/8（木）〜10/9（金）');
  assert.equal(formatStamp('2026-10-05T07:42:00Z'), '10/5 16:42');
  assert.equal(formatStamp('2026-10-05T07:42:00Z', '2026-10-05'), '16:42');
});

test('納期の状態', () => {
  assert.equal(dueState('2026-10-06', '2026-10-20'), 'active');
  assert.equal(dueState('2026-10-06', '2026-10-09'), 'soon');
  assert.equal(dueState('2026-10-06', '2026-10-06'), 'soon');
  assert.equal(dueState('2026-10-06', '2026-10-05'), 'over');
});

test('月カレンダーは日曜始まりで、週ごとに7マス', () => {
  const g = monthGrid('2026-10');
  assert.equal(g[0][3], null); // 10/1 は木曜
  assert.equal(g[0][4], '2026-10-01');
  assert.ok(g.every((w) => w.length === 7));
  assert.equal(g.flat().filter(Boolean).length, 31);
});

test('締めの期間', () => {
  assert.deepEqual(periodOf('2026-10', null), { key: '2026-10', start: '2026-10-01', end: '2026-10-31', label: '10月分' });
  assert.deepEqual(periodOf('2026-10', 20), { key: '2026-10', start: '2026-09-21', end: '2026-10-20', label: '10月分' });
  assert.deepEqual(periodOf('2026-01', 20), { key: '2026-01', start: '2025-12-21', end: '2026-01-20', label: '1月分' });
  assert.equal(periodContaining('2026-10-20', 20).key, '2026-10');
  assert.equal(periodContaining('2026-10-21', 20).key, '2026-11');
  assert.equal(periodContaining('2026-10-31', null).key, '2026-10');
  assert.equal(shiftPeriod(periodOf('2026-10', null), -1, null).end, '2026-09-30');
});

const att = (p: Partial<AttendanceRow>): AttendanceRow => ({
  id: Math.random().toString(),
  site_id: 's1',
  user_id: 'u1',
  work_date: '2026-10-01',
  unit: 1,
  overtime_hours: 0,
  computed_ninku: 1,
  unit_price: 20000,
  entered_by: 'u1',
  approved_at: '2026-10-01T00:00:00Z',
  approved_by: 'u1',
  created_at: '',
  updated_at: '',
  ...p,
});

test('集計：現場別・人別・合計・承認待ち', () => {
  const s = summarize({
    range: { start: '2026-10-01', end: '2026-10-31' },
    sites: [
      { id: 's1', name: '塚本' },
      { id: 's2', name: '豊中' },
    ],
    users: [
      { id: 'u1', display_name: '田中', trade: '大工', phone: null },
      { id: 'u2', display_name: '西', trade: '内装', phone: null },
    ],
    attendances: [
      att({ computed_ninku: 1.25, overtime_hours: 2 }),
      att({ user_id: 'u2', approved_at: null }),
      att({ site_id: 's2', unit_price: 22000, work_date: '2026-10-02' }),
      att({ work_date: '2026-09-30' }), // 期間外
    ],
    assignments: [
      { site_id: 's1', user_id: 'u1', work_date: '2026-10-01' },
      { site_id: 's1', user_id: 'u1', work_date: '2026-10-10' },
    ],
  });
  assert.equal(s.actual, 3.25);
  assert.equal(s.planned, 2);
  assert.equal(s.amount, 25000 + 20000 + 22000);
  assert.equal(s.pendingCount, 1);
  assert.equal(s.bySite[0].siteId, 's1');
  assert.equal(s.bySite[0].actual, 2.25);
  assert.deepEqual(
    s.byMember.map((m) => [m.name, m.actual, m.days, m.pending]),
    [
      ['田中', 2.25, 2, 0],
      ['西', 1, 1, 1],
    ],
  );
});

test('CSV：見出し・明細・合計', () => {
  const rows = attendanceCsvRows({
    range: { start: '2026-10-01', end: '2026-10-31' },
    sites: [{ id: 's1', name: '塚本', client_name: '丸和建設' }],
    users: [{ id: 'u1', display_name: '田中', trade: '大工', phone: null }],
    attendances: [att({ computed_ninku: 1.25, overtime_hours: 2 }), att({ work_date: '2026-10-02', unit: 0.5, computed_ninku: 0.5 })],
  });
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[1], ['2026-10-01', '木', '塚本', '丸和建設', '田中', '大工', '1日', 2, 1.25, 20000, 25000, '済']);
  assert.equal(rows[2][6], '半日');
  assert.deepEqual(rows[3].slice(0, 1), ['合計']);
  assert.equal(rows[3][8], 1.75);
  assert.equal(rows[3][10], 35000);
});
