import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorText, Field } from '@/components/form';
import { Screen } from '@/components/screen';
import { BigButton, T } from '@/components/ui';
import { Space, useColors } from '@/constants/theme';
import { toMessage } from '@/lib/errors';
import { requireSupabase } from '@/lib/supabase';

/**
 * ログイン。メールに届く数字のコードで入る（パスワードなし）。
 * LINE ログインは LINE Developers のチャネル審査が通ってから足す。
 */
export default function LoginScreen() {
  const c = useColors();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    const address = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(address)) {
      setError('メールアドレスを確かめてください');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await requireSupabase().auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) setError(toMessage(error));
    else setStep('code');
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const { error } = await requireSupabase().auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);
    // 成功したらセッションが変わり、ルートの振り分けで次の画面に移る
    if (error) setError(toMessage(error));
  };

  return (
    <Screen size="narrow">
      <View style={styles.brand}>
        <T font="brand" style={styles.logo}>
          ニンクル
        </T>
        <T tone="textSub" style={styles.tagline}>
          現場の段取りと人工を、仲間で共有
        </T>
      </View>

      <BigButton label="LINEでログイン（準備中）" kind="secondary" style={styles.line} />
      <T tone="textSub" style={styles.or}>
        または メールで
      </T>

      {step === 'email' ? (
        <>
          <Field
            label="メールアドレス"
            value={email}
            onChangeText={setEmail}
            placeholder="tanaka@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            onSubmitEditing={sendCode}
          />
          <ErrorText>{error}</ErrorText>
          <BigButton label={busy ? '送っています…' : 'コードを送る'} onPress={busy ? undefined : sendCode} style={styles.mt} />
        </>
      ) : (
        <>
          <T style={[styles.sent, { color: c.text }]}>{email} にコードを送りました。メールの数字を入れてください。</T>
          <Field
            label="コード"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
            placeholder="123456"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={8}
            onSubmitEditing={verify}
            style={styles.code}
          />
          <ErrorText>{error}</ErrorText>
          <BigButton
            label={busy ? '確かめています…' : 'ログイン'}
            onPress={busy || code.length < 6 ? undefined : verify}
            kind={code.length < 6 ? 'secondary' : 'primary'}
            style={styles.mt}
          />
          <BigButton
            label="メールアドレスを直す"
            kind="ghost"
            onPress={() => {
              setStep('email');
              setCode('');
              setError(null);
            }}
            style={styles.mt}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { paddingTop: Space.xl * 2, paddingBottom: Space.xl, alignItems: 'center' },
  logo: { fontSize: 40, fontWeight: '900', letterSpacing: 2 },
  tagline: { fontSize: 16, fontWeight: '700', marginTop: Space.s },
  line: { marginTop: Space.l, opacity: 0.6 },
  or: { textAlign: 'center', fontSize: 15, fontWeight: '700', marginTop: Space.xl },
  sent: { fontSize: 17, fontWeight: '700', marginTop: Space.l, lineHeight: 26 },
  code: { fontSize: 28, fontWeight: '900', letterSpacing: 8, textAlign: 'center' },
  mt: { marginTop: Space.l },
});
