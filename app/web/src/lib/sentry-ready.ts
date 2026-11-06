/**
 * ブラウザの Sentry の初期化が済んだか（Issue #277）。初期化は最初の画面のあと（instrumentation-client.ts）に行うので、
 * それより前に送りたいもの（起動の時間 lib/boot-timing.ts）は、これを待ってから送る。
 * DSN が無い・初期化しないときも、決して解決しない（送らない）。
 */
let resolveReady: () => void = () => {};
const ready = new Promise<void>((r) => {
  resolveReady = r;
});
export function markSentryReady() {
  resolveReady();
}
export function whenSentryReady(): Promise<void> {
  return ready;
}
