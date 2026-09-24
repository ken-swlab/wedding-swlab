import type { ReactNode } from "react";

/** /onboarding /pending /guestbook で共通のヘッダと余白 */
export function GuestShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-xl px-4 py-8">
        <header className="mb-6 text-center">
          <h1 className="font-serif text-2xl tracking-wide text-stone-900">Guest Book</h1>
          <p className="mt-1 text-sm text-stone-500">おふたりへのメッセージを残してください</p>
        </header>
        {children}
      </div>
    </main>
  );
}
