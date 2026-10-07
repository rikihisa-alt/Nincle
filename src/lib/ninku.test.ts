/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  computeNinku,
  DEFAULT_OVERTIME_RULE,
  formatNinku,
  ninkuAmount,
  overtimeNinku,
  sumNinku,
} from './ninku.ts';

test('1日は1.0人工、半日は0.5人工', () => {
  assert.equal(computeNinku(1.0, 0, DEFAULT_OVERTIME_RULE), 1.0);
  assert.equal(computeNinku(0.5, 0, DEFAULT_OVERTIME_RULE), 0.5);
});

test('既定ルールでは残業2時間で0.25人工', () => {
  assert.equal(overtimeNinku(2, DEFAULT_OVERTIME_RULE), 0.25);
  assert.equal(computeNinku(1.0, 2, DEFAULT_OVERTIME_RULE), 1.25);
  assert.equal(computeNinku(0.5, 2, DEFAULT_OVERTIME_RULE), 0.75);
});

test('固定加算と換算なし', () => {
  assert.equal(computeNinku(1.0, 3, { kind: 'fixed', addNinku: 0.5 }), 1.5);
  assert.equal(computeNinku(1.0, 0, { kind: 'fixed', addNinku: 0.5 }), 1.0);
  assert.equal(computeNinku(1.0, 3, { kind: 'none' }), 1.0);
});

test('合計で浮動小数の誤差を出さない', () => {
  assert.equal(sumNinku([0.1, 0.2, 0.125, 0.5]), 0.925);
  assert.equal(sumNinku([]), 0);
});

test('金額と表示', () => {
  assert.equal(ninkuAmount(6.5, 20000), 130000);
  assert.equal(ninkuAmount(1.125, 22000), 24750);
  assert.equal(formatNinku(14), '14.0');
  assert.equal(formatNinku(9.5), '9.5');
  assert.equal(formatNinku(1.25), '1.25');
});
