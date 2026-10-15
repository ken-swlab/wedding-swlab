# 公開バケットの Referer の制限（Issue #123）

最終更新: 2026-10-15（**まだルールは置いていない**。案と手順だけ）

公開バケット（`wedding-media.sw-lab.net`）の写真を、サイト（`https://wedding.sw-lab.net/`）のページからの読み込みだけに絞る。Cloudflare の WAF のカスタムルールで、Referer を見て拒否する。

- **これは抑止で、防御ではない。**Referer は、コマンド 1 行で偽装できる。止められるのは「URL をアドレス欄に貼る・トークで送る・ほかのサイトに埋め込む」といった、ふつうの開き方だけ。確実に止めるのは、削除（Issue #122）と署名つき URL（必要になったら別 Issue）。
- 置き場所は Cloudflare のゾーン `sw-lab.net` の WAF だけ。Vercel の Firewall（CLAUDE.md ルール 19）と、`wedding.sw-lab.net` 本体の DNS（ルール 20）は変えない。
- 非公開バケット（原本）は、もともと外から開けないので、対象外。
- **ルールを置く・外すのはオーナー。**Claude Code は、`scripts/media-referer-check.py`（読み取りのみ）で確かめるところまで。

## 1. ルールの案

場所: Cloudflare の管理画面 → ゾーン `sw-lab.net` → Security → WAF → Custom rules → Create rule（画面の名前は変わることがある）。

### 案 A（strict。Issue の案。Referer が空も拒否）

| 項目 | 値 |
|---|---|
| ルール名 | `media-referer-guard` |
| 式（Edit expression） | `(http.host in {"wedding-media.sw-lab.net" "media.wedding.sw-lab.net"} and not starts_with(http.referer, "https://wedding.sw-lab.net/"))` |
| 動作 | Block |
| 順番 | ほかのカスタムルールより後ろでよい（このホストに効くルールは、ほかに無い） |

### 案 B（lenient。Referer が空なら通す）

式: `(http.host in {"wedding-media.sw-lab.net" "media.wedding.sw-lab.net"} and http.referer ne "" and not starts_with(http.referer, "https://wedding.sw-lab.net/"))`

- ほかのサイトへの埋め込みは止まるが、**アドレス欄に貼る・トークのリンクを開く**（Referer が空）は止まらない。
- 2 の調査で Referer が空の読み込みが一定数あったとき（＝空を拒否すると、正規のゲストの写真が消える）の、切り戻し先。

### 決めたこと（仮。オーナーの確認待ち）

| 項目 | 仮の判断 | 理由 |
|---|---|---|
| 旧ドメイン `media.wedding.sw-lab.net` | 同じルールに入れる | 画面は `media-url.ts` の `rehost` で新しいドメインに付け替えて読むので、サイトからの読み込みは旧ドメインに行かない。外に出た古い URL だけが旧ドメインを使う |
| 開発のオリジン（`localhost:3000`・Codespaces のプレビュー） | 許可に入れない | 開発はエミュレーターで、本番の写真を読まない（アップロードは 503）。入れると、その分ゆるくなる |
| Referer が空の読み込み | 案 A（拒否）で始め、2 の調査の結果で案 B に切り替えるかを決める | Issue の案 |

- 式の `https://wedding.sw-lab.net/` は、サーバーが顔検出の取得に付ける値（`app/web/src/config/media-access.ts` の `MEDIA_FETCH_REFERER`）と、末尾のスラッシュまでそろえる。
- WAF のルールは Cloudflare のキャッシュより前に効く。キャッシュに残っている写真も、ルールで止まる。

## 2. 進め方（順番が大事）

1. **コードの変更をマージ・デプロイする**（PR #123 の分。サーバーの取得に Referer を付ける）。この時点では、何も変わらない。デプロイのあと、管理画面で顔の再照合（`/admin` の顔の画面）が動くことを確かめる。
2. **Referer が空の読み込みの割合を調べる**（1 週間ほど。ゲストが使い始めてから）。
   - 調べ方の案: Custom rules に、動作 **Skip**・「Log matching requests」を有効にしたルールを置く。式は `(http.host eq "wedding-media.sw-lab.net" and http.referer eq "")`。Security → Events にこのルールの件数が出る。全体の件数は、ゾーンの Analytics でホスト `wedding-media.sw-lab.net` に絞って見る（Skip は何も止めないので、置いても影響は無い。ルールの位置は、ほかのルールより後ろ）。
   - 比べるもの: 空の件数 ÷ 全体の件数。数 % を超えるなら、どの端末か（User-Agent）を Events で見る。
3. **実機で確かめる**（まだルールは置かない）。下の 3 の「実機で」の行を、ルールの前に一度見ておく（壊れていないことの基準）。
4. **ルールを置く**（案 A）。**披露宴の 1 か月前より後には置かない。**置いたら、すぐに:
   - `python3 scripts/media-referer-check.py <テスト用のゲストの写真の URL>` → すべて OK
   - 3 の表の「実機で」の行を、もう一度
5. 問題があれば、すぐに切り戻す（4）。

## 3. 影響を受けるもの

| 読み込み元 | Referer | 対応・確認 |
|---|---|---|
| ゲストの画面の `<img>`・`<video>`（タイムライン・拡大・アイコン）、`/screen` | 付く（`Referrer-Policy: strict-origin-when-cross-origin` なので、`https://wedding.sw-lab.net/`） | **実機で**: LINE アプリ内ブラウザ（iOS・Android）、iOS Safari、スクリーンの PC。動画の再生（途中から読む Range のリクエスト）も |
| 写真の保存（`src/lib/photo-save.ts` の `fetch`） | 付く | **実機で**: 共有シート、LINE アプリ内ブラウザ |
| 写真の長押しの「写真に保存」（ブラウザ自身の機能） | **分からない**（ブラウザが Referer を付けずに取り直すことがある） | **実機で**。止まるなら、保存はアプリの「保存」ボタン（`photo-save.ts`）で案内する |
| 顔検出のサーバーからの取得（`src/lib/rekognition.ts` の `fetchImageBytes`。`/api/faces/detect`・`/api/admin/faces/match`・`retry`） | このPRで付けた | デプロイ後に、投稿の顔検出と管理画面の再照合が動くこと |
| 運用スクリプト `app/web/scripts/scan-published-metadata.mjs` | — | R2 の S3 API で読むので、影響しない |
| 運用スクリプト `scripts/infra-verify.sh` | 付かない | バケットの根（`/`）への接続だけを見ている。ルールのあとは 404 ではなく 403 になるが、どちらも「応答あり」と判定する |
| Worker（`exif-stripper`） | — | R2 に直接つなぐ（バインディング）。`wrangler.toml` の `PUBLIC_BASE` は URL を組み立てるだけで、読み込みはしない。影響しない |
| Referer を送らないブラウザ・設定（プライバシー系の設定や拡張、一部のアプリ内ブラウザ） | 付かない | **写真がすべて表示されなくなる。**2 の調査で割合を見る |
| アドレス欄に貼る・トークで送ったリンクを開く・ほかのサイトに埋め込む | 付かない・ほかのサイト | **止めたいもの**（案 A。案 B は埋め込みだけ） |

### 拒否されたときの画面の見え方

- 画面の `<img>`・`<video>` には、読み込みの失敗の処理（`onError`）が無い。**壊れた画像の印か、代わりの文字（alt）が出るだけで、説明の文言は出ない。**
- ルールを置いて正規のゲストに出たら、それは切り戻しの合図（4）。文言を出す処理を足すなら、別 Issue にする。

## 4. 切り戻し

1. Cloudflare の管理画面 → ゾーン `sw-lab.net` → Security → WAF → Custom rules → `media-referer-guard` のスイッチを **オフ**（数十秒で効く。消さなくてよい）。
2. `python3 scripts/media-referer-check.py <写真の URL> --expect off` で、すべて通ることを確かめる。
3. 原因が Referer が空の端末なら、案 B に式を変えてから、もう一度オンにする。

## 5. 記録

ルールを置いた・外した・式を変えたら、日付と理由をここに 1 行ずつ足す（端末の詳細や、ゲストの情報は書かない）。

| 日付 | 操作 | 理由 |
|---|---|---|
| — | （まだ置いていない） | — |
