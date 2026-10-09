import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';

import { useColors } from '@/constants/theme';

/**
 * 画面ごとの背景（コンクリート調の薄いグラデーション）。クリアパネルはこの上に半透明で重なる。
 * 画面ごとに塗るので、切り替えたときに前の画面が透けて重なることはない。
 */
export function Backdrop() {
  const c = useColors();
  return (
    <LinearGradient
      pointerEvents="none"
      colors={c.bgGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
  );
}
