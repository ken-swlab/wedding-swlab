"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { UploadApi } from "@/hooks/useUpload";
import { postJson } from "@/lib/api-client";
import { useGuestSessionContext } from "./GuestSessionContext";
import { useBackToClose } from "@/hooks/useHistoryOverlay";
import { PhotoFineIcon, PhotoQuickIcon } from "@/components/icons";

type PhotoIntroApi = {
  /** 写真付きで投稿したあとに呼ぶ。まだ説明を見ていなければ出し、見た印を残す */
  showIfFirst: () => void;
  /** 説明をもう一度出す（帯の「なぜ2回？」） */
  open: () => void;
};

const PhotoIntroContext = createContext<PhotoIntroApi | null>(null);

/**
 * 「写真は2回に分けて届けます」の説明（Issue #272）。軽量版と高画質版の役割を一言で伝える。
 * ★軽量版＝当日（タイムライン・スクリーン・エンドロール）、高画質版＝あとで保存・思い出★（Issue #280）
 *   高画質版の説明に「上映」「エンドロール」を使わない（当日の上映には軽量版を使うため）。
 *
 * ★写真付きで初めて投稿したときだけ出す★ 見た印は本人の設定（guestPrivate.photoIntroSeen。POST /api/guest/preferences）。
 *   端末を変えても二度出さない。印を書けなくても、このページを開いている間は出さない（localSeen）。
 * ★帯の「なぜ2回？」からは、何度でも出せる★（open）
 * ★ゲストに見える言葉は「軽量版」「高画質版」だけ★（「本アップロード」「本体」「端末に保存」は使わない）
 * GuestbookDataProvider の中に1つだけ置く（送信の列 useUpload を受け取り、「今すぐ高画質版を送る」に使う）。
 */
export function PhotoIntroProvider({ upload, children }: { upload: UploadApi; children: ReactNode }) {
  const { photoIntroSeen } = useGuestSessionContext();
  const [open, setOpen] = useState(false);
  const localSeen = useRef(false);
  const seenRef = useRef(photoIntroSeen);
  useEffect(() => {
    seenRef.current = photoIntroSeen;
  }, [photoIntroSeen]);

  const showIfFirst = useCallback(() => {
    if (seenRef.current || localSeen.current) return;
    localSeen.current = true;
    setOpen(true);
    // 書けなくても投稿には関係しない（次にページを開いたとき、もう一度出るだけ）
    postJson("/api/guest/preferences", { photoIntroSeen: true }).catch((e: unknown) =>
      console.error("[photo-intro] 説明を見た印の保存に失敗しました", e),
    );
  }, []);
  const api = useMemo<PhotoIntroApi>(() => ({ showIfFirst, open: () => setOpen(true) }), [showIfFirst]);
  // 戻る（左端のスワイプ）でも閉じる（Issue #273）
  const closeSheet = useCallback(() => setOpen(false), []);
  useBackToClose(open, closeSheet);

  const canSendNow = upload.remaining > 0 && !upload.running;
  return (
    <PhotoIntroContext.Provider value={api}>
      {children}
      {open && (
        <PhotoIntroSheet
          onClose={() => setOpen(false)}
          onSendNow={
            canSendNow
              ? () => {
                  setOpen(false);
                  if (upload.failed.length > 0) upload.retryFailed();
                  else upload.start();
                }
              : undefined
          }
        />
      )}
    </PhotoIntroContext.Provider>
  );
}

/** Provider の外（管理画面の見本など）では何もしない */
export function usePhotoIntro(): PhotoIntroApi {
  return useContext(PhotoIntroContext) ?? { showIfFirst: () => {}, open: () => {} };
}

/** 下から出る小さなシート。外側を押しても閉じる */
function PhotoIntroSheet({ onClose, onSendNow }: { onClose: () => void; onSendNow?: () => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-intro-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      // ★投稿したあとの知らせ（トースト。z-[55]）より上★
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40"
    >
      <div
        className="composer-sheet-in w-full max-w-xl rounded-t-2xl bg-white px-5 pt-5 shadow-xl"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <h2 id="photo-intro-title" className="font-serif text-lg text-stone-900">
          写真は2回に分けて届けます
        </h2>
        <ol className="mt-4 space-y-4">
          <IntroRow icon={<PhotoQuickIcon className="h-7 w-7" />} step="①" title="軽量版">
            いま、すぐにタイムラインに載せました。当日のスクリーンやエンドロールにも、この写真を使います。
          </IntroRow>
          <IntroRow icon={<PhotoFineIcon className="h-7 w-7" />} step="②" title="高画質版">
            元のきれいな写真です。あとでみんなが写真を保存するときや、2人の思い出に残すために使います。会が終わってからでも大丈夫なので、Wi-Fi のときに送ってください。
          </IntroRow>
        </ol>
        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="mt-6 flex min-h-[var(--inv-tap)] w-full touch-manipulation items-center justify-center rounded-full bg-stone-900 text-[length:calc(15px*var(--inv-scale))] font-semibold text-white hover:bg-stone-700"
        >
          わかりました
        </button>
        {onSendNow && (
          <button
            type="button"
            onClick={onSendNow}
            className="mt-1 flex min-h-[var(--inv-tap)] w-full touch-manipulation items-center justify-center text-xs text-stone-500 underline underline-offset-4"
          >
            今すぐ高画質版を送る
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

function IntroRow({ icon, step, title, children }: { icon: ReactNode; step: string; title: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden className="mt-0.5 text-stone-700">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-stone-900">
          {step} {title}
        </p>
        <p className="mt-0.5 text-[length:calc(13px*var(--inv-scale))] leading-relaxed text-stone-600">{children}</p>
      </div>
    </li>
  );
}
