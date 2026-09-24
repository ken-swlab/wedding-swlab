"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
// global-error はルートレイアウトを置き換えるので、スタイルも自分で読み込む
import "./globals.css";

/**
 * ルートレイアウトごと描画に失敗したときの最後の画面。
 * ここに来た例外を Sentry に送る（送信前に sentry-scrub で個人情報を落とす）。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ja">
      <body className="flex min-h-screen items-center justify-center bg-stone-50 px-6">
        <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
          <h1 className="font-serif text-lg text-stone-900">表示できませんでした</h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-500">
            一時的な問題が発生しました。
            <br />
            少し時間をおいてから、もう一度お試しください。
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-5 w-full rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white hover:bg-stone-700"
          >
            再読み込み
          </button>
          {error.digest && (
            <p className="mt-4 text-[11px] text-stone-400">お問い合わせ番号: {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  );
}
