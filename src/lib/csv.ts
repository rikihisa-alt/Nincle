import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';

function cell(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Excel で文字化けしないよう BOM を付ける */
export function toCsv(rows: (string | number)[][]): string {
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

/**
 * CSV を書き出す。Web はファイルとして保存、端末は共有シート（メール・LINE・ファイルに保存など）に渡す。
 * 表計算ソフト（Excel・Numbers・Googleスプレッドシート）でそのまま開ける。
 */
export async function exportCsv(filename: string, csv: string) {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(csv);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: filename, UTI: 'public.comma-separated-values-text' });
  } else {
    await Share.share({ title: filename, message: csv });
  }
}
