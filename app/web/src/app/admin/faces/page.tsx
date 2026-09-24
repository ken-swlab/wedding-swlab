"use client";
import { postJson } from "@/lib/api-client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import { useGuestSession } from "@/hooks/useGuestSession";
import { useAdminGuests } from "@/hooks/useAdminGuests";
import { useUnmatchedFaces } from "@/hooks/useUnmatchedFaces";
import { useMatchedFaces } from "@/hooks/useMatchedFaces";
import { MatchedFacesPanel } from "@/components/admin/MatchedFacesPanel";
import { FaceContext, FaceThumbnail } from "@/components/admin/FaceThumbnail";
import { compareGuests } from "@/lib/roster";
import { adminName, adminSubName } from "@/lib/names";
// from "@/lib/roster";
import { IGNORED, type FaceDoc } from "@/types/faces";
import type { GuestRow } from "@/types/admin";
import { rehost } from "@/lib/media-url";

async function post(path: string, body: unknown) {
  return postJson(path, body);
}

export default function AdminFacesPage() {
  const { user, isAdmin, loading: authLoading } = useGuestSession();
  const { rows } = useAdminGuests(isAdmin);
  const { faces, loading, error } = useUnmatchedFaces(isAdmin);
  const matched = useMatchedFaces(isAdmin);
  const [tab, setTab] = useState<"unmatched" | "matched">("unmatched");

  const [picking, setPicking] = useState<FaceDoc | null>(null);
  const [q, setQ] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const nameOf = (r: GuestRow) => adminName(r);

  const guests = useMemo(
    () =>
      rows
        .filter((r) => r.attendance !== "declined" && r.invitationStatus !== "declined").sort(compareGuests),
    [rows],
  );

  const listed = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return guests;
    return guests.filter((r) =>
      `${r.nickname} ${r.displayName}`.toLowerCase().includes(needle),
    );
  }, [guests, q]);

  const advance = useCallback(
    (done: FaceDoc) => {
      const i = faces.findIndex((f) => f.id === done.id);
      setPicking(faces[i + 1] ?? null);
    },
    [faces],
  );

  const match = useCallback(
    async (face: FaceDoc, guestUid: string, label: string) => {
      try {
        await post("/api/admin/faces/match", { faceId: face.id, guestUid });
        setToast(label);
        advance(face);
      } catch (e) {
        setToast(e instanceof Error ? e.message : "失敗しました");
      }
    },
    [advance],
  );

  const unmatch = useCallback(async (face: FaceDoc) => {
    try {
      await post("/api/admin/faces/match", { faceId: face.id, guestUid: null });
      setToast("紐付けを解除しました");
    } catch (e) { setToast(e instanceof Error ? e.message : "失敗しました"); }
  }, []);

    const [retrying, setRetrying] = useState(false);
  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      const r = await post("/api/admin/faces/retry", {});
      const matched = Number(r.matched ?? 0); const scanned = Number(r.scanned ?? 0);
      setToast(r.message ? String(r.message) : matched > 0 ? `${scanned} 件を再判定し、${matched} 件が自動で紐付きました` : `${scanned} 件を再判定しましたが、該当はありませんでした`);
    } catch (e) { setToast(e instanceof Error ? e.message : "失敗しました"); } finally { setRetrying(false); }
  }, []);

  const rescan = useCallback(async () => {
    setScanning(true);
    try {
      const r = await post("/api/faces/detect", { scan: true });
      setToast(`${r.queued ?? 0} 件の投稿を検出キューに入れました`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "失敗しました");
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPicking(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking]);

  if (authLoading) {
    return <main className="min-h-screen bg-stone-50 p-8"><div className="h-32 animate-pulse rounded-2xl bg-stone-200/60" /></main>;
  }
  if (!user || !isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8">
        <p className="text-sm text-stone-600">管理者専用ページです</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-5">
          <Link href="/admin" className="text-xs text-stone-400 hover:text-stone-700">
            ← ゲスト管理に戻る
          </Link>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-serif text-xl text-stone-900">顔の名寄せ</h1>
              <p className="mt-1 text-sm text-stone-500">
                投稿写真から自動検出した顔です。誰の顔かを選ぶと、その投稿に紐付きます。
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm tabular-nums text-stone-500">
                未処理 <span className="text-lg font-semibold text-stone-900">{faces.length}</span>
              </span>
              <button type="button" onClick={() => void retry()} disabled={retrying || faces.length === 0} title="学習が進んだAIで、未処理の顔をもう一度照合します" className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">{retrying ? "再判定中…" : "賢くなったAIで再判定"}</button>
              <button
                type="button"
                onClick={() => void rescan()}
                disabled={scanning}
                className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-50"
              >
                {scanning ? "実行中…" : "未検出を再スキャン"}
              </button>
            </div>
          </div>
        </header>

        <div className="mb-4 flex gap-1">
          <button type="button" onClick={() => setTab("unmatched")} className={`rounded-full px-4 py-1.5 text-sm transition ${tab === "unmatched" ? "bg-stone-900 text-white" : "bg-white text-stone-600 hover:bg-stone-100"}`}>未処理<span className={`ml-1.5 rounded-full px-1.5 text-xs tabular-nums ${tab === "unmatched" ? "bg-white/20" : "bg-amber-100 text-amber-800"}`}>{faces.length}</span></button>
          <button type="button" onClick={() => setTab("matched")} className={`rounded-full px-4 py-1.5 text-sm transition ${tab === "matched" ? "bg-stone-900 text-white" : "bg-white text-stone-600 hover:bg-stone-100"}`}>処理済み<span className={`ml-1.5 rounded-full px-1.5 text-xs tabular-nums ${tab === "matched" ? "bg-white/20" : "bg-stone-100 text-stone-600"}`}>{matched.faces.length}</span></button>
        </div>
        {tab === "matched" ? ( <MatchedFacesPanel faces={matched.faces} guests={rows} loading={matched.loading} onUnmatch={unmatch} /> ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <p className="font-medium">読み込みに失敗しました（{error.code}）</p>
            {error.code === "failed-precondition" && (
              <p className="mt-1">インデックスの作成中です。数分お待ちください。</p>
            )}
          </div>
        ) : loading ? (
          <div className="h-64 animate-pulse rounded-2xl bg-stone-200/60" />
        ) : faces.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 p-16 text-center">
            <p className="text-sm text-stone-500">未処理の顔はありません 🎉</p>
            <p className="mt-2 text-xs text-stone-400">
              新しい投稿があると自動で検出されます。
              反映されない場合は「未検出を再スキャン」を押してください。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
            {faces.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setPicking(f)}
                title={f.postText || f.authorName}
                className="group flex flex-col items-center gap-1.5"
              >
                <FaceThumbnail
                  src={rehost(f.imageUrl)}
                  box={f.boundingBox}
                  size={84}
                  className="ring-2 ring-transparent transition group-hover:ring-stone-900"
                />
                <span className="w-full truncate text-center text-[10px] text-stone-400">
                  {f.authorName}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {picking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white md:flex-row">
            <div className="flex shrink-0 flex-col gap-3 bg-stone-900 p-4 md:w-1/2">
              <div className="flex items-center gap-3">
                <FaceThumbnail src={rehost(picking.imageUrl)} box={picking.boundingBox} size={64} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {picking.authorName} の投稿
                  </p>
                  <p className="truncate text-[11px] text-white/40">
                    確度 {Math.round(picking.confidence)}%
                  </p>
                </div>
              </div>
              <FaceContext src={rehost(picking.imageUrl)} box={picking.boundingBox} />
              {picking.postText && (
                <p className="text-xs leading-relaxed text-white/60">{picking.postText}</p>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col p-4">
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="名前で絞り込む"
                  className="flex-1 rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-400"
                />
                <button
                  type="button"
                  onClick={() => setPicking(null)}
                  aria-label="閉じる"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-lg text-stone-500"
                >
                  ×
                </button>
              </div>

              <ul className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
                {listed.map((r) => (
                  <li key={r.uid}>
                    <button
                      type="button"
                      onClick={() => void match(picking, r.uid, `${nameOf(r)} に紐付けました`)}
                      className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-stone-100"
                    >
                      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-stone-200">
                        {(r.referencePhotoUrl || r.photoURL) && (
                          <Image
                            src={r.referencePhotoUrl || r.photoURL!}
                            alt=""
                            fill
                            sizes="36px"
                            className="object-cover"
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-stone-800">
                          {nameOf(r)}
                          {r.isPreRegistered && (
                            <span className="ml-1.5 rounded-full bg-stone-100 px-1.5 py-0.5 text-[9px] text-stone-500">
                              未ログイン
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[10px] text-stone-400">
                          {r.kana || adminSubName(r) || r.displayName}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {listed.length === 0 && (
                  <li className="p-6 text-center text-xs text-stone-400">該当なし</li>
                )}
              </ul>

              <button
                type="button"
                onClick={() => void match(picking, IGNORED, "無視しました")}
                className="mt-2 shrink-0 rounded-lg border border-stone-200 py-2 text-sm text-stone-500 hover:bg-stone-50"
              >
                人物ではない / 対象外（無視）
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-stone-900 px-5 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}
