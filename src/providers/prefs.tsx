/**
 * 見やすさの設定（端末ごと）。20代〜70代まで使うので、アプリの中でも文字の大きさと明るさを選べるようにする。
 * 端末の文字サイズ設定にも追従したうえで、さらに掛け合わせる。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

export type TextSize = 'normal' | 'large' | 'xlarge';
export type ThemePref = 'system' | 'light' | 'dark';

export const TEXT_SCALE: Record<TextSize, number> = { normal: 1, large: 1.18, xlarge: 1.36 };
export const TEXT_SIZE_LABEL: Record<TextSize, string> = { normal: 'ふつう', large: '大きめ', xlarge: 'とても大きい' };
export const THEME_LABEL: Record<ThemePref, string> = { system: '端末に合わせる', light: '明るい', dark: '暗い' };

type Prefs = {
  textSize: TextSize;
  theme: ThemePref;
  scale: number;
  setTextSize: (v: TextSize) => void;
  setTheme: (v: ThemePref) => void;
};

const KEY = 'ninkuru.prefs';

const PrefsContext = createContext<Prefs>({
  textSize: 'normal',
  theme: 'system',
  scale: 1,
  setTextSize: () => {},
  setTheme: () => {},
});

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [textSize, setTextSizeState] = useState<TextSize>('normal');
  const [theme, setThemeState] = useState<ThemePref>('system');

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as Partial<{ textSize: TextSize; theme: ThemePref }>;
        if (saved.textSize && saved.textSize in TEXT_SCALE) setTextSizeState(saved.textSize);
        if (saved.theme && saved.theme in THEME_LABEL) setThemeState(saved.theme);
      })
      .catch(() => {});
  }, []);

  const save = (next: { textSize: TextSize; theme: ThemePref }) => {
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  };

  const value: Prefs = {
    textSize,
    theme,
    scale: TEXT_SCALE[textSize],
    setTextSize: (v) => {
      setTextSizeState(v);
      save({ textSize: v, theme });
    },
    setTheme: (v) => {
      setThemeState(v);
      save({ textSize, theme: v });
    },
  };
  return <PrefsContext value={value}>{children}</PrefsContext>;
}

export function usePrefs(): Prefs {
  return use(PrefsContext);
}
