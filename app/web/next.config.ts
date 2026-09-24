import type { NextConfig } from "next";

/**
 * ★next/image の許可ホスト★
 *
 *   ここはビルド時に解決されるので、環境変数を変えたら再デプロイが要る。
 *   ドメイン移行中は新旧の両方を許可しておく。片方だけにすると、
 *   まだ旧URLを持っている投稿の画像が 400 になる。
 *   旧ドメインを畳んだあとにフォールバックの1行を消す。
 */
const MEDIA_HOSTS = Array.from(
  new Set(
    [
      process.env.NEXT_PUBLIC_MEDIA_BASE,
      process.env.R2_PUBLIC_BASE,
      "https://wedding-media.sw-lab.net",
      "https://media.wedding.sw-lab.net", // ← 旧ドメイン撤去後に削除する
    ]
      .filter((v): v is string => !!v)
      .map((v) => {
        try {
          return new URL(v).hostname;
        } catch {
          return null;
        }
      })
      .filter((v): v is string => !!v),
  ),
);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      ...MEDIA_HOSTS.map((hostname) => ({ protocol: "https" as const, hostname })),
      // reference_faces は Firebase Storage に残しているので、以下も必要
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "storage.googleapis.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      // LINE のプロフィール画像。ここを忘れると全員のアイコンが壊れる
      { protocol: "https", hostname: "profile.line-scdn.net" },
      { protocol: "https", hostname: "obs.line-scdn.net" },
    ],
  },
};

export default nextConfig;
