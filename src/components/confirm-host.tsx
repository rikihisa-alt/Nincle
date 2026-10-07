import { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { BigButton, Icon, Icons, T } from '@/components/ui';
import { Space, useColors } from '@/constants/theme';
import { registerConfirmHost, type ConfirmRequest } from '@/lib/confirm';

/** 確認の画面。「やめとく」を上、実行を下に置き、押し間違えても取り返しがつく側を先に見せる */
export function ConfirmHost() {
  const c = useColors();
  const [req, setReq] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    registerConfirmHost(setReq);
    return () => registerConfirmHost(null);
  }, []);

  const close = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };

  return (
    <Modal visible={Boolean(req)} transparent animationType="fade" onRequestClose={() => close(false)}>
      <View style={[styles.backdrop, { backgroundColor: c.overlay }]}>
        <View
          style={[styles.box, { backgroundColor: c.card, borderColor: c.text }]}
          accessibilityViewIsModal
          accessibilityRole="alert">
          <View style={styles.head}>
            <Icon name={Icons.warning} size={28} color={c.statusSoon} />
            <T style={styles.title} accessibilityRole="header">
              {req?.title ?? ''}
            </T>
          </View>
          <T style={styles.message}>{req?.message ?? ''}</T>
          <BigButton label="やめとく" kind="secondary" onPress={() => close(false)} />
          <BigButton label={req?.okLabel ?? 'OK'} kind="danger" onPress={() => close(true)} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: Space.l },
  box: { width: '100%', maxWidth: 480, alignSelf: 'center', borderWidth: 2, borderRadius: 16, padding: Space.xl, gap: Space.m },
  head: { flexDirection: 'row', alignItems: 'center', gap: Space.s },
  title: { flex: 1, fontSize: 22, fontWeight: '900' },
  message: { fontSize: 17, fontWeight: '600', lineHeight: 27, marginBottom: Space.s },
});
