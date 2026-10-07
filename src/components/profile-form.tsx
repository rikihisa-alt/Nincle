import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips, ErrorText, Field } from '@/components/form';
import { BackHeader } from '@/components/header';
import { Screen } from '@/components/screen';
import { BigButton, T } from '@/components/ui';
import { Space } from '@/constants/theme';
import { TRADES } from '@/constants/trades';
import { api } from '@/data/client';
import { toMessage } from '@/lib/errors';
import { useAuth } from '@/providers/auth';
import { useToast } from '@/providers/toast';

/** プロフィール入力。初回登録（setup）と、設定からの修正（edit）で使う。30秒で終わるように */
export function ProfileForm({ mode }: { mode: 'setup' | 'edit' }) {
  const { userId, profile, refreshProfile, signOut } = useAuth();
  const toast = useToast();
  const initialTrade = profile?.trade ?? null;
  const isPreset = initialTrade !== null && (TRADES as readonly string[]).includes(initialTrade);
  const [name, setName] = useState(profile?.display_name ?? '');
  const [trade, setTrade] = useState<string | null>(isPreset ? initialTrade : initialTrade ? 'その他' : null);
  const [otherTrade, setOtherTrade] = useState(isPreset ? '' : (initialTrade ?? ''));
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalTrade = trade === 'その他' ? otherTrade.trim() : trade;

  const save = async () => {
    if (!userId) return;
    if (!name.trim()) return setError('名前を入れてください');
    if (!finalTrade) return setError('職種を選んでください');
    setBusy(true);
    setError(null);
    try {
      await api.updateProfile(userId, { display_name: name.trim(), trade: finalTrade, phone: phone.trim() || null });
      await refreshProfile();
      // setup はプロフィールが埋まるとルートの振り分けで自動的にホームへ移る
      if (mode === 'edit') {
        toast('保存しました', 'ok');
        router.back();
      }
    } catch (e) {
      setError(toMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen size="narrow" header={mode === 'edit' ? <BackHeader title="名前・職種・電話" /> : undefined}>
      {mode === 'setup' && (
        <View style={styles.header}>
          <T style={styles.title}>はじめに</T>
          <T tone="textSub" style={styles.sub}>
            仲間に表示される名前と職種を入れてください（30秒で終わります）
          </T>
        </View>
      )}

      <Field label="名前（仲間に見える）" required value={name} onChangeText={setName} placeholder="田中" maxLength={30} />

      <T style={styles.label}>職種</T>
      <ChoiceChips options={TRADES} value={trade as (typeof TRADES)[number] | null} onChange={setTrade} />
      {trade === 'その他' && (
        <Field label="職種を入力" value={otherTrade} onChangeText={setOtherTrade} placeholder="防水" maxLength={20} />
      )}

      <Field
        label="電話番号（なくても可）"
        value={phone}
        onChangeText={setPhone}
        placeholder="090-1234-5678"
        keyboardType="phone-pad"
        autoComplete="tel"
        maxLength={20}
        hint="入れておくと、同じ現場の仲間がアプリから電話をかけられます"
      />

      <ErrorText>{error}</ErrorText>
      <BigButton label={mode === 'setup' ? 'これで始める' : '保存する'} busy={busy} onPress={save} style={styles.mt} />
      {mode === 'setup' && <BigButton label="別のメールで入り直す" kind="ghost" onPress={signOut} style={styles.mt} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: Space.xl },
  title: { fontSize: 30, fontWeight: '900' },
  sub: { fontSize: 16, fontWeight: '700', marginTop: Space.xs, lineHeight: 24 },
  label: { fontSize: 16, fontWeight: '800', marginTop: Space.l },
  mt: { marginTop: Space.l },
});
