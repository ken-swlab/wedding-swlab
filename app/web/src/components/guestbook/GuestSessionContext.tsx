"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { GuestSession } from "@/hooks/useGuestSession";

const GuestSessionContext = createContext<GuestSession | null>(null);

/**
 * (guest)/layout.tsx が持っているセッションを下の画面に配る。
 *
 * ★useGuestSession は Context ではなく、呼ぶたびに購読が増える★
 *   (guest) 配下の画面は新たに useGuestSession を呼ばず、これを使う。
 */
export function GuestSessionProvider({ value, children }: { value: GuestSession; children: ReactNode }) {
  return <GuestSessionContext.Provider value={value}>{children}</GuestSessionContext.Provider>;
}

export function useGuestSessionContext(): GuestSession {
  const v = useContext(GuestSessionContext);
  if (!v) throw new Error("GuestSessionProvider の外で呼ばれました");
  return v;
}
