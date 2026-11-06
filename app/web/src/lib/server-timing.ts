/**
 * API の中の時間を Server-Timing ヘッダで返す（Issue #277）。ブラウザの開発ツールの「タイミング」と、
 * 計測（Sentry・perf:slow）で、どの読み書きに時間がかかっているかを見るため。
 *
 * ★名前と時間（ミリ秒）だけを返す★ 中身（uid・値）は入れない。
 * ★同時に走らせる処理は、それぞれの開始から終わりまでを測る★（time）。足し算すると合計より長くなる。
 * ★このファイルは `@/` で値を import しない★（tests/ が Node でそのまま読み込む）
 */
export type ServerTiming = {
  /** 処理（Promise）の開始から終わりまでを name で測る。失敗しても測ってから投げ直す */
  time: <T>(name: string, work: Promise<T>) => Promise<T>;
  /** Server-Timing ヘッダの値（最後に total を足す） */
  header: () => string;
};

/** 名前に使える文字だけにする（ヘッダを壊さない） */
function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 32) || "step";
}

export function createServerTiming(now: () => number = () => performance.now()): ServerTiming {
  const start = now();
  const parts: string[] = [];
  return {
    async time(name, work) {
      const t0 = now();
      try {
        return await work;
      } finally {
        parts.push(`${safeName(name)};dur=${(now() - t0).toFixed(1)}`);
      }
    },
    header() {
      return [...parts, `total;dur=${(now() - start).toFixed(1)}`].join(", ");
    },
  };
}
