import { notFound } from "next/navigation";
import { PreviewPanel } from "./PreviewPanel";

/**
 * 画面の見本（Issue #230）。小さい画面での表示崩れを、実機なしで一通り確かめるための入口。
 * /dev/preview?screen=<key> で、場面に合うテスト用アカウントに入ってから、その画面を開く（場面は config/preview-screens.json）。
 *
 * ★本番のビルドでは出さない（404）★ NODE_ENV が production のとき（next build のあとの next start・Vercel）は notFound()。
 * ★データは手元のエミュレーターだけ★ ログインは開発用ログイン（/api/auth/dev。エミュレーターでしか動かない）を使い、
 *   中身はエミュレーターの初期データ（架空の名前・図形の画像）。本番の Firebase にはつながない。
 *   撮影は npm run test:screens（scripts/screens.mjs）。
 */
export default async function DevPreviewPage({ searchParams }: PageProps<"/dev/preview">) {
  if (process.env.NODE_ENV === "production") notFound();
  // ★?screen= はサーバーで読んで渡す★ ブラウザ側の初期値で読むと、サーバーの HTML と食い違う（hydration のエラー）
  const screen = (await searchParams).screen;
  return <PreviewPanel screenKey={typeof screen === "string" ? screen : null} />;
}
