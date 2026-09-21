import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // ★R2 のカスタムドメイン★ ここを忘れると投稿画像が全部壊れる
      { protocol: "https", hostname: "media.wedding.sw-lab.net" },
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
