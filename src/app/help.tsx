import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BackHeader } from '@/components/header';
import { Screen } from '@/components/screen';
import { Card, Icon, Icons, SectionLabel, T } from '@/components/ui';
import { MinTap, Space, useColors } from '@/constants/theme';

type Item = { q: string; a: string };

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: 'はじめに（親方）',
    items: [
      { q: 'まず何をすればいい？', a: '①「設定」→「仲間の名簿・招待」でチームを作る　②「仲間を招待する」を押して、LINEやSMSでリンクを送る　③「現場」タブの「現場を作る」で、工期と単価を入れて、入ってもらう人を選ぶ。これで準備はおしまいです。' },
      { q: '仲間がリンクを開けないときは？', a: '招待のメッセージに書いてある「招待コード」を、仲間のアプリの「チーム」→「招待コードで入る」に入れてもらってください。' },
    ],
  },
  {
    title: '毎日つかう（みんな）',
    items: [
      { q: '出面の入れ方', a: 'ホームの「今日の段取り」で「1日」か「半日」を押すだけです。残業したときは「残業あり」を押して、時間を足してから「出面を入れる」を押します。' },
      { q: '昨日の出面を入れ忘れた', a: 'ホームの「月の予定」でその日を押すか、現場の「出面」タブで日付を戻して入れてください。' },
      { q: '電波がない現場では？', a: '出面だけは電波がなくても入れられます。端末にためておき、つながったら自動で送ります。ホームに「送信待ち」と出ている間は、まだ送れていません。' },
      { q: '「入れる？」と聞かれたら', a: 'ホームの「やること」か、現場の「予定」タブで「入れる／入れん／まだわからん」を押します。あとから押し直せます。' },
      { q: '写真を送りたい', a: '現場の「やりとり」タブで「写真」を押します。写真には現場名と日付が付いて表示されるので、黒板の代わりになります。' },
    ],
  },
  {
    title: '予定を組む（管理者）',
    items: [
      { q: '入れる人を聞く', a: '現場の「予定」タブで「予定の確認を出す」を押し、日にちと集合時間を選びます。仲間の空き・埋まりも見られます。メンバー全員に通知が届きます。' },
      { q: '返事が集まったら', a: '確認の下の「入る人を決める」を押して、人と日を選びます。決めた人のカレンダーに予定が入り、通知が届きます。返事がない人には「つつく」で通知を送れます。' },
      { q: '電話で話がついている', a: '「聞かずに予定を入れる」から、日にちと人を選んでください。' },
      { q: '納期が近い・過ぎた', a: '現場に「納期まで◯日」と出ます。過ぎると管理者に通知が届くので、「納期を延ばす」か「完了にする」を選んでください。勝手には閉じません。' },
    ],
  },
  {
    title: '集計と締め（親方）',
    items: [
      { q: '月末にすること', a: '「人工」タブで中身を確かめ、承認待ちを承認してから「◯月分を確定する」を押します。確定した月は誰も直せなくなり、単価も固まります。間違いがあれば「確定を戻す」で直せます。' },
      { q: '請求書を作りたい', a: '「人工」タブの「CSVで書き出す」で、日付・現場・名前・人工・金額の一覧ができます。Excelなどで開いて、請求書づくりに使ってください。' },
      { q: '20日締めにしたい', a: '「設定」→「仲間の名簿・招待」→チームを開いて、締め日を選んでください。' },
      { q: '人によって単価が違う', a: '現場の「設定」→メンバーの「単価」で、一人ずつ変えられます。' },
    ],
  },
  {
    title: '見やすさ',
    items: [
      { q: '字が小さい', a: '「設定」→「見やすさ」で「大きめ」「とても大きい」を選べます。端末の文字の大きさの設定にも合わせて大きくなります。' },
      { q: '外で画面が見えにくい', a: '「設定」→「画面の明るさ」で「明るい」を選び、端末の画面の明るさも上げてください。' },
    ],
  },
];

/** 使い方（よくある質問） */
export default function HelpScreen() {
  const c = useColors();
  const [open, setOpen] = useState<string | null>(SECTIONS[0].items[0].q);
  return (
    <Screen size="narrow" header={<BackHeader title="使い方" sub="知りたいことを押してください" />}>
      {SECTIONS.map((s) => (
        <View key={s.title}>
          <SectionLabel>{s.title}</SectionLabel>
          <Card>
            {s.items.map((item, i) => {
              const isOpen = open === item.q;
              return (
                <View key={item.q} style={i > 0 && { borderTopWidth: 1, borderTopColor: c.border }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }}
                    onPress={() => setOpen(isOpen ? null : item.q)}
                    style={styles.q}>
                    <T style={styles.qText}>{item.q}</T>
                    <Icon name={isOpen ? Icons.close : Icons.chevron} size={20} color={c.textSub} />
                  </Pressable>
                  {isOpen && <T style={styles.a}>{item.a}</T>}
                </View>
              );
            })}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  q: { minHeight: MinTap + 4, flexDirection: 'row', alignItems: 'center', gap: Space.s, paddingHorizontal: Space.l, paddingVertical: Space.s },
  qText: { flex: 1, fontSize: 18, fontWeight: '800' },
  a: { fontSize: 17, fontWeight: '600', lineHeight: 27, paddingHorizontal: Space.l, paddingBottom: Space.l },
});
