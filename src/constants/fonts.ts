/**
 * フォント（iOS・Android）。Web は fonts.web.ts。
 *
 * すっきり・引き算の方針：
 * - 文字はすべて Noto Sans JP（癖のない標準的なゴシック）。見出しも本文も同じ書体で、太さだけ変える
 * - 数字（人工・金額・日付）だけ Inter。桁がそろい、小数点がはっきり見える
 * - 太さは 3 段（標準 400・中 500・太 700）に絞る。コード上の 800/900 も 700 にまとめる
 */
import { useFonts } from 'expo-font';
import type { TextStyle } from 'react-native';

import { tierOf } from './fonts-tier';

import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { NotoSansJP_400Regular } from '@expo-google-fonts/noto-sans-jp/400Regular';
import { NotoSansJP_500Medium } from '@expo-google-fonts/noto-sans-jp/500Medium';
import { NotoSansJP_700Bold } from '@expo-google-fonts/noto-sans-jp/700Bold';

export type FontRole = 'body' | 'heading' | 'number' | 'brand';

const JP = { 400: 'NotoSansJP_400Regular', 500: 'NotoSansJP_500Medium', 700: 'NotoSansJP_700Bold' };
const NUM = { 400: 'Inter_500Medium', 500: 'Inter_500Medium', 700: 'Inter_600SemiBold' };

export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    NotoSansJP_400Regular,
    NotoSansJP_500Medium,
    NotoSansJP_700Bold,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  // 読めなくても端末のフォントで動かす
  return loaded || Boolean(error);
}

export { tierOf };

export function fontFor(role: FontRole, weight: number): TextStyle {
  const table = role === 'number' ? NUM : JP;
  return { fontFamily: table[role === 'brand' ? 700 : tierOf(weight)], fontWeight: 'normal' };
}
