# ニンクル（Ninkuru）

一人親方のグループが、現場ごとに予定を合わせ、出面を記録し、人工を集計するアプリ。
Expo（React Native / TypeScript）＋ Supabase。

## 動かす

```bash
npm install
npx expo start      # w でブラウザ、i で iOS シミュレータ
```

`.env.local` がなければ **デモ表示** で動く。データは端末のメモリの中だけで、再読み込みすると元に戻る。
「設定」→「デモ：誰として見るか」で、親方（田中）とメンバー（西など）の見え方を切り替えられる。

## できること

| 画面 | 中身 |
| --- | --- |
| 予定（ホーム） | やること（返事待ち・承認待ち・納期超過・送信待ち）／今日・明日の段取り／今週／今月の人工。今日の現場は「1日」「半日」を押すだけで出面が入る。「月の予定」で月カレンダー（現場ごとに色分け） |
| 現場 | 進行中・完了・アーカイブの切り替え、検索、未読数。現場を作る（工期・単価・残業換算・メモ・メンバー） |
| 現場詳細 | **予定**：納期の警告（延ばす／完了）、予定の確認を出す（仲間の空きつき）、3択の返事、つつく、入る人を決める、聞かずに入れる、決まった予定。**やりとり**：チャット・写真（現場名と日付つき）・既読数。**出面**：日付を選んで入力、管理者は代理入力・承認・まとめて承認、直した記録 |
| 人工 | 締め期間ごと（月末／15・20・25日締め）の実績・予定・金額、現場別／人別、確認待ち、CSV書き出し、親方の確定（締め）と取り消し |
| 設定 | 文字の大きさ（3段階）・明るさ（自動／明るい／暗い）、通知の種類ごとのオン・オフ、空きの公開、チーム、使い方、ログアウト、退会 |
| チーム | 招待リンク・コード、名簿（電話をかける）、外す、締め日、名前変更、親方を渡す、削除 |

見やすさ・操作しやすさのために：押せる所はすべて 48〜56px 以上、状態は色だけでなく文字とアイコンでも出す、
主要文字のコントラスト 7:1 目標、操作のたびに結果を画面下に出す（読み上げにも通知）、日付は大きなマスのカレンダーで選ぶ、
数字は折り返さず1行に収める、言葉の途中で改行しない。

## Supabase につなぐ

1. [supabase.com](https://supabase.com) でプロジェクトを作る（リージョンは Tokyo）。
2. **Database → Extensions** で `pg_cron` を有効にする。
3. **SQL Editor** で `supabase/migrations/` の SQL を名前の順にすべて実行する
   （`init` → `features` → `cron`）。Supabase CLI なら `npx supabase link` → `npx supabase db push`。
   写真の保存先（Storage の `site-photos`）もこれで作られる。
4. **Authentication → Sign In / Providers → Email** を有効にする。
5. **Authentication → Emails → Templates** の「Confirm signup」と「Magic Link」の本文に `{{ .Token }}` を入れる
   （アプリはメールの数字でログインする）。例：`<p>ニンクルのログインコード：<strong>{{ .Token }}</strong></p>`
6. `.env.example` を `.env.local` にコピーし、**Project Settings → API** の URL と anon key を入れて `npx expo start` をやり直す。

仲間に配る前に **Authentication → Emails → SMTP Settings** で自前の SMTP（Resend など）を設定する（標準は送信数がかなり少ない）。

### プッシュ通知

1. `npx eas-cli@latest init` で EAS のプロジェクトを作る（`app.json` に projectId が入る）。
2. Edge Function を出す：`npx supabase functions deploy send-push --no-verify-jwt`
   と、関数の環境変数に `WEBHOOK_SECRET`（好きな長い文字列）を入れる。
3. **Database → Webhooks** で、テーブル `notifications` の INSERT を `send-push` に送る設定を作り、
   ヘッダー `x-webhook-secret` に同じ文字列を入れる。
4. プッシュは実機の開発ビルド（`npx expo run:ios` など）か本番ビルドで届く。Expo Go の Android とシミュレータでは届かない。
   アプリ内の「お知らせ」は、プッシュなしでも届く。

## テスト

```bash
npm test          # 人工の計算・日付・締め期間・集計・CSV
npm run test:db   # マイグレーション・RLS・RPC（PGlite で実行。Supabase 不要）
npx tsc --noEmit
npx expo lint
```

`test:db` では、権限（他人の現場が見えない・承認は管理者だけ・確定した月は直せない など）と、
サーバー側の人工計算が `src/lib/ninku.ts` と一致することを確かめている。

## 構成

| 場所 | 中身 |
| --- | --- |
| `src/app/` | 画面（Expo Router） |
| `src/data/api.ts` | データの窓口の型。`supabase-api.ts`（本番）と `demo-api.ts`（デモ）が同じ形で実装 |
| `src/data/queries.ts` | 画面用の読み込み・書き込みフック（TanStack Query） |
| `src/data/offline.ts` | 電波がないときの出面の送信待ち |
| `src/lib/ninku.ts` | 人工の計算はここだけ（サーバーの `compute_ninku` と一致をテスト） |
| `src/lib/aggregate.ts` / `period.ts` | 集計・CSV・締め期間 |
| `src/components/` | 画面の部品（大きいボタン、カレンダー、出面入力など） |
| `supabase/migrations/` | テーブル・RLS・RPC・通知・締め・Storage |
| `supabase/functions/send-push` | 通知 → Expo プッシュ |

## まだのもの

- LINE ログイン（LINE Developers のチャネル準備が要る。Supabase に標準の LINE 連携はない）
- 招待リンクを https にする（ドメイン決定後に `EXPO_PUBLIC_INVITE_BASE_URL` と Universal Links / App Links）
- 写真への現場名・日付の「焼き込み」（いまは表示時に重ねて出している）
- 請求書の発行・課金（MVP の対象外）
