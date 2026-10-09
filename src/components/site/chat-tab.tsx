import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, BigButton, Icon, Icons, LoadingView, T } from '@/components/ui';
import { fontFor } from '@/constants/fonts';
import { MinTap, Space, useColors } from '@/constants/theme';
import type { PhotoInput, SiteDetail } from '@/data/api';
import { api } from '@/data/client';
import { useAction, useMessages, usePhotoUrls, useReads } from '@/data/queries';
import { formatLong, formatStamp, stampToYmd, todayJst } from '@/lib/date';
import type { MessageRow } from '@/lib/types';
import { useMe } from '@/providers/auth';
import { usePrefs } from '@/providers/prefs';
import { useToast } from '@/providers/toast';

/** 現場のやりとり（チャット）。写真は黒板の代わりなので、現場名と日付を重ねて出す */
export function ChatTab({ detail }: { detail: SiteDetail }) {
  const c = useColors();
  const { userId } = useMe();
  const { site, members } = detail;
  const messages = useMessages(site.id);
  const reads = useReads(site.id);
  const scroll = useRef<ScrollView>(null);
  const [viewer, setViewer] = useState<{ url: string; stamp: string } | null>(null);
  const today = todayJst();

  const list = messages.data ?? [];
  const photoPaths = list.map((m) => m.image_url).filter((p): p is string => Boolean(p));
  const photos = usePhotoUrls(photoPaths);
  const lastId = list.at(-1)?.id;

  // 開いたとき・新しい書き込みが来たときに既読にする
  useEffect(() => {
    if (!lastId) return;
    api.markRead(site.id).catch(() => {});
  }, [site.id, lastId]);

  const nameOf = (uid: string) => members.find((m) => m.user_id === uid)?.user?.display_name ?? '退会した人';
  const readCount = (m: MessageRow) =>
    (reads.data ?? []).filter((r) => r.user_id !== m.user_id && r.last_read_at >= m.created_at).length;

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scroll}
        style={styles.root}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
        keyboardShouldPersistTaps="handled">
        {messages.isLoading ? (
          <LoadingView />
        ) : list.length === 0 ? (
          <T tone="textSub" style={styles.empty}>
            まだ書き込みはありません。段取りの連絡や、現場の写真をここで共有します。
          </T>
        ) : (
          list.map((m, i) => {
            const mine = m.user_id === userId;
            const day = stampToYmd(m.created_at);
            const newDay = i === 0 || stampToYmd(list[i - 1].created_at) !== day;
            const url = m.image_url ? photos.data?.[m.image_url] : null;
            const stamp = `${site.name}　${formatLong(day)}`;
            return (
              <View key={m.id}>
                {newDay && (
                  <View style={styles.dayRow}>
                    <View style={[styles.dayLine, { backgroundColor: c.border }]} />
                    <T tone="textSub" style={styles.dayText}>
                      {day === today ? '今日' : formatLong(day)}
                    </T>
                    <View style={[styles.dayLine, { backgroundColor: c.border }]} />
                  </View>
                )}
                <View style={[styles.msg, mine && styles.msgMine]}>
                  {!mine && <Avatar name={nameOf(m.user_id)} size={36} />}
                  <View style={[styles.msgBody, mine && styles.msgBodyMine]}>
                    {!mine && <T style={styles.author}>{nameOf(m.user_id)}</T>}
                    <View style={[styles.bubble, { backgroundColor: mine ? c.accent : c.card, borderColor: mine ? c.onAccent : c.border }]}>
                      {m.image_url && (
                        <Pressable
                          accessibilityRole="imagebutton"
                          accessibilityLabel={`写真。${stamp}。押すと大きく表示`}
                          onPress={() => url && setViewer({ url, stamp })}>
                          {url ? (
                            <View>
                              <Image source={{ uri: url }} style={styles.photo} contentFit="cover" />
                              <PhotoStamp text={stamp} />
                            </View>
                          ) : (
                            <View style={[styles.photo, styles.photoLoading, { backgroundColor: c.cardAlt }]}>
                              <Icon name={Icons.photo} size={32} color={c.textSub} />
                            </View>
                          )}
                        </Pressable>
                      )}
                      {m.body ? <T style={[styles.text, mine && { color: c.onAccent }]}>{m.body}</T> : null}
                    </View>
                    <T tone="textSub" style={styles.time}>
                      {formatStamp(m.created_at, today)}
                      {mine && readCount(m) > 0 ? `　既読 ${readCount(m)}` : ''}
                    </T>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      {site.status === 'archived' ? (
        <View style={[styles.closed, { borderTopColor: c.border, backgroundColor: c.cardAlt }]}>
          <T style={styles.closedText}>アーカイブした現場なので、書き込みはできません</T>
        </View>
      ) : (
        <Composer siteId={site.id} />
      )}
      <PhotoViewer viewer={viewer} onClose={() => setViewer(null)} />
    </View>
  );
}

function PhotoStamp({ text }: { text: string }) {
  return (
    <View style={styles.stamp}>
      <T style={styles.stampText}>{text}</T>
    </View>
  );
}

function Composer({ siteId }: { siteId: string }) {
  const c = useColors();
  const { userId } = useMe();
  const { scale } = usePrefs();
  const toast = useToast();
  const { run, busy } = useAction();
  const [draft, setDraft] = useState('');
  const [photo, setPhoto] = useState<PhotoInput | null>(null);
  const [choosing, setChoosing] = useState(false);

  const pick = async (from: 'camera' | 'library') => {
    setChoosing(false);
    try {
      if (from === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          toast('カメラを使う許可がありません。端末の設定で許可してください', 'error');
          return;
        }
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
      const res = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (!res.canceled && res.assets[0]) {
        const a = res.assets[0];
        setPhoto({ uri: a.uri, width: a.width, height: a.height });
      }
    } catch {
      toast('写真を開けませんでした', 'error');
    }
  };

  const send = async () => {
    const body = draft.trim();
    if (!body && !photo) return;
    const ok = await run(async () => {
      await api.sendMessage(siteId, userId, body, photo ?? undefined);
      return true;
    });
    if (ok) {
      setDraft('');
      setPhoto(null);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.composer, { borderTopColor: c.border, backgroundColor: c.bg }]}>
      {photo && (
        <View style={styles.preview}>
          <Image source={{ uri: photo.uri }} style={styles.previewImg} contentFit="cover" />
          <T style={styles.previewText}>この写真を送ります</T>
          <Pressable accessibilityRole="button" accessibilityLabel="写真をやめる" onPress={() => setPhoto(null)} style={styles.iconBtnPlain}>
            <Icon name={Icons.close} size={24} color={c.text} />
          </Pressable>
        </View>
      )}
      <View style={styles.inputRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="写真をつける"
          onPress={() => (Platform.OS === 'web' ? pick('library') : setChoosing(true))}
          style={[styles.iconBtn, { backgroundColor: c.cardAlt, borderColor: c.border }]}>
          <Icon name={Icons.camera} size={26} color={c.text} />
          <T style={styles.iconLabel}>写真</T>
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="ひとこと書く"
          placeholderTextColor={c.textSub}
          multiline
          accessibilityLabel="書き込む内容"
          maxFontSizeMultiplier={1.6}
          style={[styles.input, fontFor('body', 400), { color: c.text, backgroundColor: c.card, borderColor: c.border, fontSize: 18 * scale }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="送る"
          accessibilityState={{ disabled: busy || (!draft.trim() && !photo) }}
          disabled={busy || (!draft.trim() && !photo)}
          onPress={send}
          style={[
            styles.iconBtn,
            { backgroundColor: c.accent, borderColor: c.onAccent, opacity: busy || (!draft.trim() && !photo) ? 0.5 : 1 },
          ]}>
          <Icon name={Icons.send} size={24} color={c.onAccent} />
          <T style={[styles.iconLabel, { color: c.onAccent }]}>送る</T>
        </Pressable>
      </View>
      <Modal visible={choosing} transparent animationType="fade" onRequestClose={() => setChoosing(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: c.overlay }]} onPress={() => setChoosing(false)}>
          <View style={[styles.chooser, { backgroundColor: c.bg }]}>
            <BigButton label="写真を撮る" icon={Icons.camera} onPress={() => pick('camera')} />
            <BigButton label="撮った写真から選ぶ" icon={Icons.photo} kind="secondary" onPress={() => pick('library')} />
            <BigButton label="やめる" kind="ghost" onPress={() => setChoosing(false)} />
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function PhotoViewer({ viewer, onClose }: { viewer: { url: string; stamp: string } | null; onClose: () => void }) {
  return (
    <Modal visible={Boolean(viewer)} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.viewer}>
        {viewer && (
          <View style={styles.viewerBody}>
            <Image source={{ uri: viewer.url }} style={styles.viewerImg} contentFit="contain" />
            <PhotoStamp text={viewer.stamp} />
          </View>
        )}
        <BigButton label="閉じる" kind="secondary" onPress={onClose} style={styles.viewerClose} />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: Space.l, gap: Space.m, width: '100%', maxWidth: 600, alignSelf: 'center' },
  empty: { fontSize: 16, fontWeight: '700', lineHeight: 24, marginTop: Space.l },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: Space.s, marginVertical: Space.s },
  dayLine: { flex: 1, height: 1 },
  dayText: { fontSize: 14, fontWeight: '800' },
  msg: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.s },
  msgMine: { justifyContent: 'flex-end' },
  msgBody: { flexShrink: 1, maxWidth: '82%', gap: 2, alignItems: 'flex-start' },
  msgBodyMine: { alignItems: 'flex-end' },
  author: { fontSize: 14, fontWeight: '800' },
  bubble: { borderRadius: 12, borderWidth: 1, padding: Space.m, gap: Space.s },
  text: { fontSize: 17, lineHeight: 25 },
  time: { fontSize: 13, fontWeight: '700' },
  photo: { width: 240, height: 180, borderRadius: 6 },
  photoLoading: { alignItems: 'center', justifyContent: 'center' },
  stamp: { position: 'absolute', left: 6, bottom: 6, backgroundColor: '#F5C400', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  stampText: { fontSize: 12, fontWeight: '900', color: '#141414' },
  closed: { borderTopWidth: 1, padding: Space.l },
  closedText: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  composer: { borderTopWidth: 1, paddingHorizontal: Space.m, paddingTop: Space.s, paddingBottom: Space.s },
  preview: { flexDirection: 'row', alignItems: 'center', gap: Space.s, marginBottom: Space.s, width: '100%', maxWidth: 600, alignSelf: 'center' },
  previewImg: { width: 64, height: 64, borderRadius: 6 },
  previewText: { flex: 1, fontSize: 16, fontWeight: '800' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Space.s, width: '100%', maxWidth: 600, alignSelf: 'center' },
  iconBtn: { width: MinTap + 6, minHeight: MinTap + 6, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  iconBtnPlain: { width: MinTap, height: MinTap, alignItems: 'center', justifyContent: 'center' },
  iconLabel: { fontSize: 12, fontWeight: '800' },
  input: { flex: 1, minHeight: MinTap + 6, maxHeight: 140, borderWidth: 1, borderRadius: 10, paddingHorizontal: Space.m, paddingTop: 14 },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  chooser: { padding: Space.l, gap: Space.s, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: Space.xl * 1.5 },
  viewer: { flex: 1, backgroundColor: '#000' },
  viewerBody: { flex: 1 },
  viewerImg: { flex: 1 },
  viewerClose: { margin: Space.l },
});
