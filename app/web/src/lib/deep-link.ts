/**
 * LINE のリッチメニュー（写真・会費・案内）から、押した画面を開く（Issue #303）。
 *
 * リッチメニューの URL は `https://liff.line.me/{LIFF ID}?to=/guide/payment` の形（行き先はクエリの to）。
 *   LIFF のエンドポイントは /invitation なので、パスを付けた形（…/{LIFF ID}/guide）はエンドポイントの後ろにつながり、
 *   /invitation/guide になって開けない。クエリなら、LIFF の変換方式のどちらでも届く：
 *     - Concatenate … エンドポイントにそのまま付く（/invitation?to=/guide/payment）
 *     - Replace（互換）… liff.state に入って届く（/invitation?liff.state=%3Fto%3D%2Fguide%2Fpayment）
 *   ★liff.init は待たない★（ログイン済みの人は起動のときに liff.init を呼ばない。Issue #250）ので、liff.state も自分で読む。
 *   liff.state がパス（/guide など）のときも、そのパスを行き先として読む。
 * ★受け付けるのはサイトの中の、呼び出し側が許したパスだけ★（ゲストブックとご案内。外のサイトへ飛ばす抜け道にしない）
 *   `//`・`\`・別のオリジンになるものは断る。
 * ★このファイルは `@/` で値を import しない★（tests/ が Node でそのまま読み込む）
 */

/** リッチメニューから来た印（行き先に付けて移り、(guest)/layout.tsx が読んで消す） */
export const MENU_VIA_PARAM = "via";
export const MENU_VIA_VALUE = "menu";

const BASE = "https://deep-link.invalid";

function toFrom(query: string): string | null {
  return new URLSearchParams(query).get("to");
}

/** 行き先のパス（無い・許されないなら null）。search は location.search（先頭の ? はあってもなくてもよい） */
export function deepLinkTarget(search: string, allowed: (path: string) => boolean): string | null {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  let to = q.get("to");
  const state = q.get("liff.state");
  if (!to && state) {
    if (state.startsWith("?")) to = toFrom(state.slice(1));
    else if (state.startsWith("/")) {
      const i = state.indexOf("?");
      to = (i >= 0 ? toFrom(state.slice(i + 1)) : null) ?? (i >= 0 ? state.slice(0, i) : state);
    }
  }
  if (!to || !to.startsWith("/") || to.startsWith("//") || to.includes("\\")) return null;
  let path: string;
  try {
    const u = new URL(to, BASE);
    if (u.origin !== BASE) return null;
    path = u.pathname;
  } catch {
    return null;
  }
  return allowed(path) ? path : null;
}

/** 行き先に「リッチメニューから来た」印を付けた URL */
export function withMenuMark(path: string): string {
  return `${path}?${MENU_VIA_PARAM}=${MENU_VIA_VALUE}`;
}

/** location.search に「リッチメニューから来た」印があるか */
export function hasMenuMark(search: string): boolean {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get(MENU_VIA_PARAM) === MENU_VIA_VALUE;
}
