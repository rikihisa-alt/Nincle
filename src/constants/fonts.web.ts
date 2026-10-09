/**
 * フォント（Web）。考え方は fonts.ts と同じ（Noto Sans JP ＋ 数字だけ Inter、太さは 3 段）。
 * 読み込み中は端末のフォントで表示し、届いたら切り替わる（display=swap）。
 */
import type { TextStyle } from 'react-native';

import { tierOf } from './fonts-tier';

export type FontRole = 'body' | 'heading' | 'number' | 'brand';

const JP = "'Noto Sans JP', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif";
const NUM = "Inter, 'Noto Sans JP', 'Hiragino Sans', sans-serif";

const HREF =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Inter:wght@500;600&display=swap';

let injected = false;

export function useAppFonts(): boolean {
  if (!injected && typeof document !== 'undefined') {
    injected = true;
    for (const href of ['https://fonts.googleapis.com', 'https://fonts.gstatic.com']) {
      const pre = document.createElement('link');
      pre.rel = 'preconnect';
      pre.href = href;
      if (href.includes('gstatic')) pre.crossOrigin = 'anonymous';
      document.head.appendChild(pre);
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = HREF;
    document.head.appendChild(link);
  }
  return true;
}

export { tierOf };

export function fontFor(role: FontRole, weight: number): TextStyle {
  const tier = role === 'brand' ? 700 : tierOf(weight);
  if (role === 'number') {
    return { fontFamily: NUM, fontWeight: tier === 700 ? '600' : '500', fontVariant: ['tabular-nums'] };
  }
  return { fontFamily: JP, fontWeight: String(tier) as TextStyle['fontWeight'] };
}
