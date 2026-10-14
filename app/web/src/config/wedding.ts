import sample from "./invitation-sample.json";
import type { InvitationConfig } from "@/types/invitation";

/**
 * 招待状とオープニングに出す情報の「形」と、架空の見本。
 *
 * ★本物の名前・日付・会場・住所はリポジトリに書かない★（公開リポジトリ。Issue #131）
 *   本物は Firestore の config/invitation にだけ置く。クライアントからは読み書きできず（Rules の既定の拒否）、
 *   サーバー（src/lib/invitation-server.ts）が Admin SDK で読んで、パスコードを通った人にだけ
 *   GET /api/guest/invitation で返す。値は `node scripts/ops.mjs invitation set <JSON ファイル>` で入れる。
 *
 * ここにあるのは架空の値だけ。使うのは次の2か所で、本番のゲストには出ない。
 *   - 開発用ログイン（npm run dev:emulator）の初期データ（scripts/emulator-seed.mjs が同じ JSON を読む）
 *   - 管理者の確認用ページ（/admin/invitation_test・/admin/design）
 *
 * ★パスコードはここに書かない★ サーバーの WEDDING_PASSCODE だけが持つ。
 * ★新郎新婦の写真を public/ に置かない★ public/ の中身は URL を知っていれば誰でも取れる。
 */
export const SAMPLE_INVITATION: InvitationConfig = sample as unknown as InvitationConfig;
