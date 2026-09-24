"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLiffAuth } from "@/hooks/useLiffAuth";
import { WEDDING } from "@/config/wedding";

export default function InvitationPage() {
  const router = useRouter();
  const { phase, user, message, login } = useLiffAuth(false);

  useEffect(() => {
    if (user) router.replace("/guestbook");
  }, [user, router]);

  useEffect(() => {
    router.prefetch("/guestbook");
  }, [router]);

  const busy = phase === "liff-init" || phase === "line-login" || phase === "exchanging";

  return (
    <main className="min-h-dvh bg-[#faf9f7] text-stone-800">
      <div className="relative h-[58dvh] min-h-[360px] w-full overflow-hidden bg-stone-200">
        <div className="absolute inset-0 flex items-center justify-center text-stone-400 text-sm">
          画像（/invitation/hero.jpg）を配置してください
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/45" />
        <div className="absolute inset-x-0 bottom-0 p-7 text-center text-white">
          <p className="text-[11px] tracking-[0.35em] opacity-80">WEDDING INVITATION</p>
          <h1 className="mt-3 font-serif text-[26px] leading-tight drop-shadow-sm">
            {WEDDING.groom}
            <span className="mx-3 text-lg opacity-70">&amp;</span>
            {WEDDING.bride}
          </h1>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[26rem] px-6 pb-32">
        <section className="pt-10 text-center">
          <p className="font-serif text-sm tracking-widest text-stone-400">ご挨拶</p>
          <div className="mt-5 space-y-2.5">
            {WEDDING.greeting.map((line) => (
              <p key={line} className="text-[13.5px] leading-[2] text-stone-600">{line}</p>
            ))}
          </div>
        </section>
        <hr className="my-10 border-stone-200" />
        <section>
          <p className="text-center font-serif text-sm tracking-widest text-stone-400">開催概要</p>
          <dl className="mt-5 space-y-4 text-[14px]">
            <div>
              <dt className="text-[11px] tracking-widest text-stone-400">日時</dt>
              <dd className="mt-1 text-stone-700">{WEDDING.dateLabel}</dd>
              <dd className="mt-0.5 text-[13px] text-stone-500">{WEDDING.receptionAt}</dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-widest text-stone-400">会場</dt>
              <dd className="mt-1 text-stone-700">{WEDDING.venueName}</dd>
              <dd className="mt-0.5 text-[13px] leading-relaxed text-stone-500">{WEDDING.venueAddress}</dd>
              {WEDDING.venueMapUrl && (
                <dd className="mt-2">
                  <a href={WEDDING.venueMapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] text-stone-500 underline underline-offset-4">
                    地図を開く
                  </a>
                </dd>
              )}
            </div>
          </dl>
        </section>
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t border-stone-200/80 bg-[#faf9f7]/95 backdrop-blur" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto w-full max-w-[26rem] px-6 pt-4">
          {message && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-[12px] text-red-700">{message}</p>}
          <button type="button" onClick={login} disabled={busy} className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#06C755] text-[15px] font-medium text-white shadow-sm transition active:brightness-95 disabled:opacity-60">
            {busy ? "LINE に接続しています…" : "出欠を回答する"}
          </button>
        </div>
      </div>
    </main>
  );
}
