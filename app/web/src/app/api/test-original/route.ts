import { NextResponse } from "next/server";
import { admin } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { db } = admin();
    // 最新の投稿を3件取得
    const snap = await db.collection("posts").orderBy("createdAt", "desc").limit(3).get();
    const results = [];

    for (const doc of snap.docs) {
      const media = doc.get("media") || [];
      for (const m of media) {
        if (m.originalUrl) {
          // R2のURLに対してHEADリクエストを送り、ファイル全体をダウンロードせずに容量だけを取得
          const res = await fetch(m.originalUrl, { method: "HEAD" });
          const bytes = res.headers.get("content-length");
          const mb = (Number(bytes) / 1024 / 1024).toFixed(2);
          
          results.push({
            status: m.originalStatus,
            url: m.originalUrl,
            actualSizeOnR2: `${mb} MB`
          });
        }
      }
    }
    return NextResponse.json({ success: true, results });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
