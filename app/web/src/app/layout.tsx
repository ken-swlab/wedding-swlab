import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// LINE でリンクを送るとプレビューにこのタイトルが出る
export const metadata: Metadata = {
  title: "WEDDING INVITATION",
  description: "招待状とゲストブック",
};

/**
 * ★viewport-fit=cover を外さない★
 *   無いと iPhone の縦向きで env(safe-area-inset-*) が 0 になり、ブラウザのバーが
 *   隠れたときにボトムナビがホームインジケーターに重なる（各画面の余白は env() 前提で書いてある）。
 *   拡大（ピンチ）は止めない。写真を拡大して見るのに使う。
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * ★すべてのページをリクエスト時に描画する★
 *   CSP の nonce は src/proxy.ts がリクエストごとに作り、Next.js が SSR の途中で
 *   <script> に付ける。ビルド時に静的生成されたページには nonce が付かないので、
 *   CSP を強制した瞬間にそのページのスクリプトがすべて止まる。
 *   ルートレイアウトで connection() を待つと、配下の全ページが動的になる。
 *   （ページはすべてクライアントコンポーネントなので、描画の中身は変わらない）
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
