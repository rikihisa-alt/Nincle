/**
 * 画面の種類（スマホ／iPad／パソコン）に合わせて組み方を変える。
 * - スマホ：縦1列・下のタブ
 * - iPad：左に細いメニュー帯・2列
 * - パソコン：左に広いメニュー・2〜3列、集計は表
 * 端末アプリでは「iPad かどうか」、Web では画面の幅で決める。
 */
import type { ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { Space } from '@/constants/theme';

export type LayoutMode = 'phone' | 'tablet' | 'desktop';

export const BREAKPOINT = { tablet: 768, desktop: 1200 } as const;

export function layoutModeFor(width: number, isPad: boolean): LayoutMode {
  if (Platform.OS !== 'web') {
    if (isPad) return 'tablet';
    // Android のタブレットなど
    return width >= 600 ? 'tablet' : 'phone';
  }
  if (width >= BREAKPOINT.desktop) return 'desktop';
  if (width >= BREAKPOINT.tablet) return 'tablet';
  return 'phone';
}

export function useLayout() {
  const { width } = useWindowDimensions();
  const isPad = Platform.OS === 'ios' && Platform.isPad;
  const mode = layoutModeFor(width, isPad);
  return {
    mode,
    width,
    isPhone: mode === 'phone',
    isTablet: mode === 'tablet',
    isDesktop: mode === 'desktop',
    /** 2列以上で並べられるか */
    isWide: mode !== 'phone',
  };
}

/** 一覧などの本文の最大幅 */
export function contentMaxWidth(mode: LayoutMode, size: 'wide' | 'narrow'): number {
  if (size === 'narrow') return mode === 'phone' ? 600 : 760;
  if (mode === 'desktop') return 1280;
  if (mode === 'tablet') return 1040;
  return 600;
}

/**
 * 横に並べる列。スマホでは上から順に縦に積む。
 * flex で幅の割合を決める（例：[3, 2] なら 3:2）。
 */
export function Columns({
  children,
  flex,
  gap = Space.xl,
  style,
}: {
  children: ReactNode[];
  flex?: number[];
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { isWide } = useLayout();
  const items = children.filter(Boolean);
  if (!isWide) return <View style={style}>{items}</View>;
  return (
    <View style={[styles.row, { gap }, style]}>
      {items.map((child, i) => (
        <View key={i} style={[styles.col, { flex: flex?.[i] ?? 1 }]}>
          {child}
        </View>
      ))}
    </View>
  );
}

/** 下から出す画面（シート）を、iPad・パソコンでは中央のダイアログにする */
export function useSheetStyle() {
  const { isWide } = useLayout();
  return {
    backdrop: isWide
      ? ({ justifyContent: 'center', alignItems: 'center', padding: Space.xl } as const)
      : ({ justifyContent: 'flex-end' } as const),
    sheet: isWide ? ({ borderRadius: 16, width: '100%', maxWidth: 560 } as const) : null,
  };
}

/** カードを格子状に並べる（スマホ1列・iPad 2列・パソコン3列） */
export function Grid({ children, gap = Space.s }: { children: ReactNode[]; gap?: number }) {
  const { mode } = useLayout();
  const cols = mode === 'desktop' ? 3 : mode === 'tablet' ? 2 : 1;
  if (cols === 1) return <View style={{ gap }}>{children}</View>;
  const rows: ReactNode[][] = [];
  children.forEach((child, i) => {
    if (i % cols === 0) rows.push([]);
    rows[rows.length - 1].push(child);
  });
  return (
    <View style={{ gap }}>
      {rows.map((row, ri) => (
        <View key={ri} style={[styles.row, { gap }]}>
          {Array.from({ length: cols }, (_, ci) => (
            <View key={ci} style={styles.col}>
              {row[ci] ?? null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  col: { flex: 1, minWidth: 0 },
});
