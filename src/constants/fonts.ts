/**
 * フォント（iOS・Android）。Web は fonts.web.ts（Google Fonts から必要な文字だけ読み込む）。
 *
 * 要所ごとに使い分ける：
 * - body（本文・ボタン・入力）：BIZ UDPゴシック … モリサワのUD書体。業務システムで多く使われ、読み間違えにくい
 * - heading（見出し・現場名）：M PLUS 1 … すっきりした太い見出し
 * - number（人工・金額・日付の数字）：Barlow … 道路標識由来。桁がそろい、小数点がつぶれない
 * - brand（ロゴ）：Dela Gothic One … 看板のような力強さ
 *
 * アプリの容量を抑えるため、使う太さだけを入れている。
 */
import { useFonts } from 'expo-font';
import type { TextStyle } from 'react-native';

import { BIZUDPGothic_400Regular } from '@expo-google-fonts/biz-udpgothic/400Regular';
import { BIZUDPGothic_700Bold } from '@expo-google-fonts/biz-udpgothic/700Bold';
import { Barlow_600SemiBold } from '@expo-google-fonts/barlow/600SemiBold';
import { Barlow_700Bold } from '@expo-google-fonts/barlow/700Bold';
import { Barlow_800ExtraBold } from '@expo-google-fonts/barlow/800ExtraBold';
import { DelaGothicOne_400Regular } from '@expo-google-fonts/dela-gothic-one/400Regular';
import { MPLUS1_800ExtraBold } from '@expo-google-fonts/m-plus-1/800ExtraBold';
import { MPLUS1_900Black } from '@expo-google-fonts/m-plus-1/900Black';

export type FontRole = 'body' | 'heading' | 'number' | 'brand';

/** 役割ごとに、入っている太さとフォント名 */
const FAMILIES: Record<FontRole, Record<number, string>> = {
  body: { 400: 'BIZUDPGothic_400Regular', 700: 'BIZUDPGothic_700Bold' },
  heading: { 800: 'MPLUS1_800ExtraBold', 900: 'MPLUS1_900Black' },
  number: { 600: 'Barlow_600SemiBold', 700: 'Barlow_700Bold', 800: 'Barlow_800ExtraBold' },
  brand: { 400: 'DelaGothicOne_400Regular' },
};

export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    BIZUDPGothic_400Regular,
    BIZUDPGothic_700Bold,
    MPLUS1_800ExtraBold,
    MPLUS1_900Black,
    Barlow_600SemiBold,
    Barlow_700Bold,
    Barlow_800ExtraBold,
    DelaGothicOne_400Regular,
  });
  // 読めなくても端末のフォントで動かす
  return loaded || Boolean(error);
}

/** 役割と太さから、いちばん近い太さのフォントを返す（端末では太さごとに別フォント名） */
export function fontFor(role: FontRole, weight: number): TextStyle {
  const table = FAMILIES[role];
  const weights = Object.keys(table).map(Number);
  const nearest = weights.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a), weights[0]);
  return { fontFamily: table[nearest], fontWeight: 'normal' };
}
