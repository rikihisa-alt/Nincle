import { useColorScheme } from 'react-native';

import { usePrefs } from '@/providers/prefs';

/**
 * 「現場の黒板と工程表」配色。
 * 地色はコンクリート寄りのグレー、アクセントは安全色（イエロー・オレンジ）。
 * 状態色は 進行中＝グレー／納期間近＝オレンジ／超過＝赤 の3つだけ。
 * 主要文字は地色に対して 7:1 以上を目標にしている。
 */
export const Palette = {
  light: {
    bg: '#D6D3CC',
    card: '#F3F1EC',
    cardAlt: '#E6E3DC',
    border: '#9E998F',
    text: '#141414',
    textSub: '#3A3833',
    accent: '#F5C400',
    onAccent: '#141414',
    statusActive: '#4A4843',
    statusSoon: '#A94A00',
    statusSoonBg: '#FFE3C7',
    statusOver: '#B3141B',
    statusOverBg: '#FFD9D6',
    ok: '#1F6B2E',
    okBg: '#DDEFD9',
    info: '#1D4F91',
    infoBg: '#DCE8F7',
    barTrack: '#C2BEB5',
    tabBar: '#1E1E1C',
    tabText: '#D9D6CF',
    tabActive: '#F5C400',
    overlay: 'rgba(0,0,0,0.55)',
  },
  dark: {
    bg: '#161615',
    card: '#262623',
    cardAlt: '#31302C',
    border: '#5C5A54',
    text: '#F5F3EE',
    textSub: '#CBC7BE',
    accent: '#FFD21F',
    onAccent: '#141414',
    statusActive: '#BDB9B0',
    statusSoon: '#FF9A4D',
    statusSoonBg: '#3D2410',
    statusOver: '#FF6B61',
    statusOverBg: '#401614',
    ok: '#6FD283',
    okBg: '#173320',
    info: '#8DB8F2',
    infoBg: '#172A44',
    barTrack: '#3E3D39',
    tabBar: '#0E0E0D',
    tabText: '#CBC7BE',
    tabActive: '#FFD21F',
    overlay: 'rgba(0,0,0,0.7)',
  },
} as const;

export type Colors = { [K in keyof typeof Palette.light]: string };

export function useIsDark(): boolean {
  const scheme = useColorScheme();
  const { theme } = usePrefs();
  return theme === 'dark' || (theme === 'system' && scheme === 'dark');
}

export function useColors(): Colors {
  return useIsDark() ? Palette.dark : Palette.light;
}

/**
 * 現場の色分け（カレンダー用）。色だけで見分けさせないよう、必ず現場名と一緒に出す。
 * 明るい・暗いどちらの地でも見える中間の濃さ。
 */
const SITE_COLORS = ['#D99A00', '#2F7FC1', '#2E8B57', '#D2581A', '#8B5CF6', '#0E8A9A', '#C2417A', '#6B7F1A'];

export function siteColor(siteId: string, order?: string[]): string {
  const idx = order ? order.indexOf(siteId) : -1;
  if (idx >= 0) return SITE_COLORS[idx % SITE_COLORS.length];
  let h = 0;
  for (const ch of siteId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SITE_COLORS[h % SITE_COLORS.length];
}

/** 手袋のまま押せる最小タップ領域 */
export const MinTap = 56;

export const Space = { xs: 4, s: 8, m: 12, l: 16, xl: 24 } as const;
