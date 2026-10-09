/**
 * フォント（Web）。役割の考え方は fonts.ts と同じ。
 * 日本語フォントは大きいので、Google Fonts から「画面に出る文字の分だけ」読み込む。
 * 読み込み中は端末のフォントで表示し、届いたら切り替わる（display=swap）。
 */
import type { TextStyle } from 'react-native';

export type FontRole = 'body' | 'heading' | 'number' | 'brand';

const STACK: Record<FontRole, string> = {
  body: "'BIZ UDPGothic', 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif",
  heading: "'M PLUS 1', 'BIZ UDPGothic', 'Hiragino Kaku Gothic ProN', sans-serif",
  number: "Barlow, 'BIZ UDPGothic', 'Hiragino Kaku Gothic ProN', sans-serif",
  brand: "'Dela Gothic One', 'M PLUS 1', sans-serif",
};

/** 役割ごとに、読み込んでいる太さ */
const WEIGHTS: Record<FontRole, number[]> = {
  body: [400, 700],
  heading: [800, 900],
  number: [600, 700, 800],
  brand: [400],
};

const HREF =
  'https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&family=M+PLUS+1:wght@800;900&family=Barlow:wght@600;700;800&family=Dela+Gothic+One&display=swap';

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

export function fontFor(role: FontRole, weight: number): TextStyle {
  const weights = WEIGHTS[role];
  const nearest = weights.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a), weights[0]);
  return { fontFamily: STACK[role], fontWeight: String(nearest) as TextStyle['fontWeight'] };
}
