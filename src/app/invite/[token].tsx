import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorText } from '@/components/form';
import { Screen } from '@/components/screen';
import { BigButton, T, Tanzaku } from '@/components/ui';
import { Space, useColors } from '@/constants/theme';
import { api } from '@/data/client';
import { toMessage } from '@/lib/errors';
import type { InvitePreview } from '@/lib/types';
import { pendingInvite, useAuth } from '@/providers/auth';

/** 招待リンクを開いたときの画面。ログイン前なら覚えておいて、登録後にここへ戻す */
export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const c = useColors();
  const { userId, profileComplete, isDemo } = useAuth();
  const ready = Boolean(userId) && (profileComplete || isDemo);
  const [preview, setPreview] = useState<InvitePreview | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !token) return;
    api
      .getInvitePreview(token)
      .then(setPreview)
      .catch((e) => setError(toMessage(e)));
  }, [ready, token]);

  const goLogin = async () => {
    await pendingInvite.save(token);
    router.replace(userId ? '/profile-setup' : '/login');
  };

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const teamId = await api.acceptInvite(token);
      router.replace({ pathname: '/team/[id]', params: { id: teamId } });
    } catch (e) {
      setError(toMessage(e));
      setBusy(false);
    }
  };

  const goHome = () => router.replace('/');

  let body;
  if (!ready) {
    body = (
      <>
        <T style={styles.text}>チームに招待されています。ログインして名前を登録したら、そのまま参加できます。</T>
        <BigButton label="ログインして参加する" onPress={goLogin} style={styles.mt} />
      </>
    );
  } else if (preview === undefined && !error) {
    body = (
      <T tone="textSub" style={styles.text}>
        招待を確かめています…
      </T>
    );
  } else if (!preview) {
    body = (
      <>
        <T style={styles.text}>この招待リンクは切れとるか、間違うとります。親方に新しいリンクをもらってください。</T>
        <BigButton label="ホームへ" kind="secondary" onPress={goHome} style={styles.mt} />
      </>
    );
  } else {
    body = (
      <>
        <Tanzaku stripe={c.accent}>
          <T style={styles.teamName}>{preview.team_name}</T>
          <T tone="textSub" style={styles.meta}>
            親方：{preview.owner_name || '（名前なし）'} ／ {preview.member_count}人
          </T>
        </Tanzaku>
        {preview.already_member ? (
          <>
            <T style={[styles.text, styles.mt]}>もうこのチームに入っています。</T>
            <BigButton label="名簿を見る" onPress={() => router.replace({ pathname: '/team/[id]', params: { id: preview.team_id } })} style={styles.mt} />
          </>
        ) : (
          <>
            <BigButton label="このチームに入る" busy={busy} onPress={join} style={styles.mt} />
            <BigButton label="やめとく" kind="ghost" onPress={goHome} style={styles.mt} />
          </>
        )}
      </>
    );
  }

  return (
    <Screen size="narrow">
      <View style={styles.header}>
        <T style={styles.title}>チームへの招待</T>
      </View>
      {body}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: Space.xl, paddingBottom: Space.l },
  title: { fontSize: 30, fontWeight: '900' },
  text: { fontSize: 17, fontWeight: '700', lineHeight: 26 },
  teamName: { fontSize: 24, fontWeight: '900' },
  meta: { fontSize: 15, fontWeight: '700' },
  mt: { marginTop: Space.l },
});
