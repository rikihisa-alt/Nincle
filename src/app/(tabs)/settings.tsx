import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Linking, StyleSheet, View } from 'react-native';

import { ChoiceChips, ToggleRow } from '@/components/form';
import { Screen } from '@/components/screen';
import { Avatar, BigButton, Card, Chip, Hint, Icons, ListRow, SectionLabel, T } from '@/components/ui';
import { Space, useColors } from '@/constants/theme';
import { Columns } from '@/lib/layout';
import type { ProfilePatch } from '@/data/api';
import { api, demoApi } from '@/data/client';
import { useAction } from '@/data/queries';
import { confirm } from '@/lib/confirm';
import { useAuth, useMe } from '@/providers/auth';
import { TEXT_SIZE_LABEL, THEME_LABEL, usePrefs, type TextSize, type ThemePref } from '@/providers/prefs';

const CONTACT = 'support@ninkuru.app';

/** 設定：自分のこと・見やすさ・通知・チーム・アカウント */
export default function SettingsScreen() {
  const c = useColors();
  const { userId, profile, isDemo } = useMe();
  const { refreshProfile, signOut, switchDemoUser } = useAuth();
  const prefs = usePrefs();
  const { run } = useAction();

  const update = async (patch: ProfilePatch, message: string) => {
    await run(() => api.updateProfile(userId, patch), message);
    await refreshProfile();
  };

  const logout = async () => {
    if (await confirm('ログアウト', 'もう一度入るときは、メールに届くコードが要ります。', 'ログアウト')) await signOut();
  };

  const deleteAccount = async () => {
    if (
      !(await confirm(
        '退会する',
        'アカウントを消します。名前と連絡先は消え、元に戻せません。これまでの出面とやりとりは、仲間の記録として「退会した人」の名前で残ります。',
        '退会する',
      ))
    ) {
      return;
    }
    await run(() => api.deleteAccount(), '退会しました');
  };

  return (
    <Screen>
      <View style={styles.header}>
        <T style={styles.title} accessibilityRole="header">
          設定
        </T>
      </View>

      <Columns flex={[1, 1]}>
        {[
          <View key="l">
      <Card>
        <View style={styles.me}>
          <Avatar name={profile?.display_name ?? '？'} size={52} />
          <View style={styles.flex}>
            <T style={styles.meName}>{profile?.display_name ?? '（名前なし）'}</T>
            <T tone="textSub" style={styles.meta}>
              {[profile?.trade, profile?.phone].filter(Boolean).join(' ／ ')}
            </T>
          </View>
          {isDemo && <Chip label="デモ" icon={Icons.info} fg={c.statusSoon} bg={c.statusSoonBg} />}
        </View>
        <View style={styles.pad}>
          <BigButton label="名前・職種・電話を直す" kind="secondary" icon={Icons.edit} compact onPress={() => router.push('/profile-edit')} />
        </View>
      </Card>

      <SectionLabel>見やすさ</SectionLabel>
      <Card style={styles.pad}>
        <T style={styles.label}>文字の大きさ</T>
        <ChoiceChips<TextSize>
          options={['normal', 'large', 'xlarge']}
          labels={TEXT_SIZE_LABEL}
          value={prefs.textSize}
          onChange={prefs.setTextSize}
        />
        <T tone="textSub" style={styles.sample}>
          見本：今日の段取り　8:00 集合　1.25人工
        </T>
        <T style={[styles.label, styles.mtl]}>画面の明るさ</T>
        <ChoiceChips<ThemePref> options={['system', 'light', 'dark']} labels={THEME_LABEL} value={prefs.theme} onChange={prefs.setTheme} />
        <T tone="textSub" style={styles.meta}>
          日なたでは「明るい」、早朝・夜・車の中では「暗い」が見やすいです
        </T>
      </Card>

      <SectionLabel>通知</SectionLabel>
      <Card>
        <ToggleRow
          first
          label="予定の確認が来たら"
          sub="「入れる？」と聞かれたとき・つつかれたとき"
          value={profile?.notify_schedule_request ?? true}
          onChange={(v) => update({ notify_schedule_request: v }, v ? '知らせるようにしました' : '知らせないようにしました')}
        />
        <ToggleRow
          label="予定が決まったら"
          value={profile?.notify_schedule_confirmed ?? true}
          onChange={(v) => update({ notify_schedule_confirmed: v }, v ? '知らせるようにしました' : '知らせないようにしました')}
        />
        <ToggleRow
          label="やりとりに書き込みがあったら"
          value={profile?.notify_chat ?? true}
          onChange={(v) => update({ notify_chat: v }, v ? '知らせるようにしました' : '知らせないようにしました')}
        />
        <ToggleRow
          label="納期を過ぎたら（管理者）"
          value={profile?.notify_due ?? true}
          onChange={(v) => update({ notify_due: v }, v ? '知らせるようにしました' : '知らせないようにしました')}
        />
      </Card>

          </View>,
          <View key="r">
      <SectionLabel>カレンダー</SectionLabel>
      <Card>
        <ToggleRow
          first
          label="空いている日を仲間に見せる"
          sub="親方が予定を組むときに、空き・埋まりだけ見えます（現場名は見えません）"
          value={profile?.calendar_public ?? true}
          onChange={(v) => update({ calendar_public: v }, v ? '空きを見せるようにしました' : '空きを見せないようにしました')}
        />
      </Card>

      <SectionLabel>チーム</SectionLabel>
      <Card>
        <ListRow first title="仲間の名簿・招待" sub="チームを作る・招待リンクを送る・締め日" onPress={() => router.push('/team')} />
        <ListRow title="使い方" sub="はじめての方へ・よくある質問" onPress={() => router.push('/help')} />
        <ListRow title="お問い合わせ" sub={CONTACT} onPress={() => Linking.openURL(`mailto:${CONTACT}?subject=${encodeURIComponent('ニンクルについて')}`)} />
      </Card>

      {isDemo && demoApi && (
        <>
          <SectionLabel>デモ：誰として見るか</SectionLabel>
          <Hint>Supabase につなぐ前のデモ表示です。データは端末の中だけで、再読み込みすると元に戻ります。人を切り替えると、親方とメンバーの見え方の違いを確かめられます。</Hint>
          <ChoiceChips
            options={demoApi.demoUsers().map((u) => u.id)}
            labels={Object.fromEntries(demoApi.demoUsers().map((u) => [u.id, `${u.display_name}（${u.trade}）`]))}
            value={userId}
            onChange={switchDemoUser}
          />
        </>
      )}

      {!isDemo && (
        <>
          <SectionLabel>アカウント</SectionLabel>
          <View style={styles.gap}>
            <BigButton label="ログアウト" kind="secondary" onPress={logout} />
            <BigButton label="退会する" kind="danger" compact onPress={deleteAccount} />
          </View>
        </>
      )}

          </View>,
        ]}
      </Columns>
      <T tone="textSub" style={styles.version}>
        ニンクル（Ninkuru）バージョン {Constants.expoConfig?.version ?? '-'}
      </T>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: Space.s },
  mtl: { marginTop: Space.l },
  header: { paddingTop: Space.l, marginBottom: Space.l },
  title: { fontSize: 30, fontWeight: '900' },
  me: { flexDirection: 'row', alignItems: 'center', gap: Space.m, padding: Space.l },
  meName: { fontSize: 22, fontWeight: '900' },
  meta: { fontSize: 14, fontWeight: '600', marginTop: Space.xs, lineHeight: 20 },
  pad: { padding: Space.l, paddingTop: 0 },
  label: { fontSize: 17, fontWeight: '800', marginTop: Space.l },
  sample: { fontSize: 16, fontWeight: '700', marginTop: Space.s },
  version: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: Space.xl },
});
