"use client";

import { createContext, useContext, type ReactNode } from "react";
const AuthorNameContext = createContext<string>("ゲスト");
export function AuthorNameProvider({ value, children }: { value: string; children: ReactNode; }) {
  return <AuthorNameContext.Provider value={value}>{children}</AuthorNameContext.Provider>;
}
export function useAuthorName(): string { return useContext(AuthorNameContext); }
