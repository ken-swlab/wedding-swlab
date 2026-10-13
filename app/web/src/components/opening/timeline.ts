/**
 * オープニングの場面を順に進めるための小さな道具（Issue #131）。
 * 場面の部品は useEffect の中で run() を呼び、片付けで cancel() を呼ぶ。
 * cancel のあとは sleep / play が決して先へ進まない（スキップ・画面を離れたあとに古い処理が動かない）。
 */
export type Timeline = {
  /** ms 待つ。cancel されたら止まったままになる */
  sleep: (ms: number) => Promise<void>;
  /** Web Animations を最後まで待つ。cancel されたら止まったままになる */
  play: (el: Element | null, keyframes: Keyframe[], options: KeyframeAnimationOptions) => Promise<void>;
  /** タイマーを予約する（cancel で取り消される） */
  after: (ms: number, fn: () => void) => ReturnType<typeof setTimeout>;
  clear: (id: ReturnType<typeof setTimeout> | null) => void;
  cancel: () => void;
  readonly alive: boolean;
};

export function createTimeline(): Timeline {
  let alive = true;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const animations = new Set<Animation>();
  const never = new Promise<void>(() => {});

  function after(ms: number, fn: () => void) {
    const id = setTimeout(() => {
      timers.delete(id);
      if (alive) fn();
    }, ms);
    timers.add(id);
    return id;
  }

  return {
    get alive() {
      return alive;
    },
    after,
    clear(id) {
      if (id === null) return;
      clearTimeout(id);
      timers.delete(id);
    },
    sleep(ms) {
      if (!alive) return never;
      return new Promise<void>((resolve) => after(ms, resolve));
    },
    async play(el, keyframes, options) {
      if (!alive || !el) return alive ? undefined : never;
      const a = el.animate(keyframes, options);
      animations.add(a);
      try {
        await a.finished;
      } catch {
        // 取り消された（cancel）。下の alive の確認で止まる
      }
      return alive ? undefined : never;
    },
    cancel() {
      alive = false;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const a of animations) a.cancel();
      animations.clear();
    },
  };
}

/** 動きを減らす設定か。拡大・水しぶきなどの動きを省く（文字は出す） */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
