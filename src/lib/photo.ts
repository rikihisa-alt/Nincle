import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** 長い辺 */
const MAX_SIDE = 1600;

/**
 * 写真は端末で縮めてから送る（電波の悪い現場でも上がるように）。
 * 縮めた結果の uri（JPEG）を返す。
 */
export async function preparePhoto(uri: string, size?: { width: number; height: number }) {
  const ctx = ImageManipulator.manipulate(uri);
  if (!size || Math.max(size.width, size.height) > MAX_SIDE) {
    ctx.resize(!size || size.width >= size.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const image = await ctx.renderAsync();
  const result = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  return { uri: result.uri, width: result.width, height: result.height };
}
