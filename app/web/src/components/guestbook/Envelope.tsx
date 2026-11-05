"use client";

import type { Ref } from "react";
import { GUESTBOOK_LOGO } from "@/config/guestbook";
import { INVITATION_COLORS } from "@/config/invitation";

/** 封筒の大きさ (px) と、ふたの高さ（封筒の 64%） */
const W = 132;
const H = 92;
const FLAP_H = Math.round(H * 0.64);
/** 便せんが上へ出る量（封筒の高さの約 46%） */
const LETTER_RISE = Math.round(H * 0.46);
/**
 * 手前のポケットの V の底（左右の折り返しが出会う高さ）。便せんが出きったとき、便せんの下の端（6 + 78 − 42 = 42px）より
 * 上に置く（下に置くと、便せんと V の間に封筒の内側の色が小さな三角でのぞく）。ふたの先（59px）に隠れる高さ
 */
const POCKET_V = Math.round(H * 0.43);
/** シールの直径 */
const SEAL = 28;
/**
 * ふたの先の丸み。先から斜めの辺に沿って TIP_X・TIP_Y だけ戻った2点を、先を制御点にした曲線でつなぐ
 * （辺の傾き 66:59 にそろえる。先は約 4px 丸く引っこむ。シールの直径より小さいので、閉じているときはシールに隠れる）
 */
const TIP_X = 9;
const TIP_Y = 8;

/**
 * ふたの三角（閉じた形）。先は丸める（Issue #267 のあと。開いたとき山の先がとがって見えた）。tipY は先の高さ、
 * inset は上の辺と左右の角を内側へ寄せる量（縁の線を太さの半分だけ内側に引く）。
 * 表の面はこの輪郭をそのまま縁の線にする（上の辺と斜めの2辺が1本でつながる）
 */
function flapPath(tipY: number, inset: number) {
  const cx = W / 2;
  return `M${inset} ${inset} H${W - inset} L${cx + TIP_X} ${tipY - TIP_Y} Q${cx} ${tipY} ${cx - TIP_X} ${tipY - TIP_Y} Z`;
}
/** 裏の面の斜めの2辺の縁（上の辺 = 開いたときの付け根は描かない。便せんの前に線が出ないように）。先は丸める */
function flapEdge(tipY: number, inset: number) {
  const cx = W / 2;
  return `M${inset} ${inset} L${cx - TIP_X} ${tipY - TIP_Y} Q${cx} ${tipY} ${cx + TIP_X} ${tipY - TIP_Y} L${W - inset} ${inset}`;
}
const PAPER = "#fdfbf7";
const EDGE = "#a89e91";
const FOLD = "#d8cfc2";
const FLAP_BACK = "#f1e9dc";
/** 便せんの色（広げた紙 PaperSheet も同じ色） */
export const ENVELOPE_LETTER = "#fffefb";
const LETTER = ENVELOPE_LETTER;

/**
 * 開く動きの時間割 (ms。押してからの時刻)。便せんが出きる時刻（LETTER_DELAY + LETTER_MS）を ENVELOPE_OPEN_MS（InvitationFlow）とそろえる（そのあと便せんを広げる）。
 *   シール: 0〜350 で少し大きくなりながら消える
 *   ふた: 150 から 550 で上へ開く（半分まで回ったところ = 425 で便せんの後ろへ回る）
 *   便せん: 350 から 700 で上へ飛び出す（少し弾む）
 */
const SEAL_MS = 350;
const FLAP_DELAY = 150;
const FLAP_MS = 550;
const LETTER_DELAY = 350;
const LETTER_MS = 700;

/**
 * 入口の封筒（Issue #267）。細い線画の封筒に、金の丸いシール（呼び名の頭文字）。押すと、シールが消え、
 * ふたが上へ開いて山形になり、便せん（INVITATION）が飛び出す。内側は無地。
 * 飛び出した便せんは、呼び出し側（InvitationFlow の EntranceStep）が PaperSheet で画面いっぱいに広げる。
 *
 * ★ふたは HTML の要素（div）を rotateX で回す★ SVG の中の要素を 3D で回すと、iOS の Safari で崩れることがある。
 *   ふたは表と裏の2面を backface-visibility: hidden で重ね、上の辺を軸に 180° 回す。
 * ★裏の面の絵は上下を反転して描く（scaleY(-1)）★ 反転しないと、開いたとき三角が逆向き（頂点が下）に見える。
 * ★重なり順★ 封筒の内側 → 便せん → 手前のポケット → ふた（閉じているとき）→ シール。
 *   ふたは回る途中（半分まで回ったところ）で、z-index を便せんより下に切り替える（遷移の delay で切り替える）。
 * ★封筒の上の端の線は、ふたの表の面が描く★ 封筒（手前のポケット）の上の辺には線を引かない（開いたとき、便せんの前に
 *   線が出ない）。ふたの縁と封筒の縁を重ねない（閉じているとき、上の線が二重に見えた）。
 * ★封筒の上の角は四角のまま★ 丸めると、開いたとき（ふたの線が裏へ回ったあと）縁の無い白い角がはみ出して見えた。
 * ★ふたの先は丸める★ 開いたとき、山の先がとがって見えないように（flapPath・flapEdge）。
 * ★シールは平らな1色★ つや・光の反射は描かない。
 * 待っている間は、1.2 秒後から 3.2 秒ごとに、ふたが少しだけ（16°）浮いて戻る（押せることの合図。globals.css の envelope-flap-idle）。
 * 動きを減らす設定では、動かさない（呼び出し側が待たずに次へ進む）。
 */
export function Envelope({ open, letterRef }: { open: boolean; /** 便せんの要素（広げる紙の始まりの位置を測る。PaperSheet） */ letterRef?: Ref<HTMLSpanElement> }) {
  const t = (ms: number, delay = 0, easing = "ease-out") => `${ms}ms ${easing} ${delay}ms`;
  return (
    <span aria-hidden="true" className="relative block" style={{ width: W, height: H, perspective: 520 }}>
      {/* ごく薄い楕円の影 */}
      <span className="absolute left-1/2 block -translate-x-1/2 rounded-full bg-black/[0.07] blur-[3px]" style={{ bottom: -12, width: W * 0.86, height: 9 }} />

      {/* 1. 封筒の内側（無地） */}
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="absolute inset-0" style={{ zIndex: 0 }}>
        <rect x="0.7" y="0" width={W - 1.4} height={H - 0.7} rx="6" fill={FLAP_BACK} />
      </svg>

      {/* 2. 便せん（INVITATION）。開くと上へ飛び出す */}
      <span
        ref={letterRef}
        className="absolute block rounded-[3px] motion-reduce:transition-none"
        style={{
          zIndex: 2,
          left: 10,
          top: 6,
          width: W - 20,
          height: H - 14,
          background: LETTER,
          boxShadow: `0 0 0 0.8px ${FOLD}`,
          transform: open ? `translateY(${-LETTER_RISE}px)` : "translateY(0)",
          transition: `transform ${t(LETTER_MS, open ? LETTER_DELAY : 0, "cubic-bezier(.3,1.2,.4,1)")}`,
        }}
      >
        <span className="mt-[11px] block text-center font-serif text-[9px] tracking-[0.3em]" style={{ color: "#8a7f72", paddingLeft: "0.3em" }}>
          INVITATION
        </span>
        <span className="mx-auto mt-[7px] block h-px w-[54px]" style={{ background: FOLD }} />
        <span className="mx-auto mt-[4px] block h-px w-[38px]" style={{ background: FOLD }} />
      </span>

      {/* 3. 手前のポケット（左右・下の折り返し）。上の辺には線を引かない */}
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="absolute inset-0" style={{ zIndex: 3 }}>
        <path d={`M0.7 0 L${W / 2} ${POCKET_V} L${W - 0.7} 0 V${H - 6.7} Q${W - 0.7} ${H - 0.7} ${W - 6.7} ${H - 0.7} H6.7 Q0.7 ${H - 0.7} 0.7 ${H - 6.7} Z`} fill={PAPER} />
        {/* 左右の折り返し・下の折り返し */}
        <path d={`M1.2 0.8 L${W / 2} ${POCKET_V} L${W - 1.2} 0.8`} fill="none" stroke={FOLD} strokeWidth="0.9" strokeLinejoin="round" />
        <path d={`M2.5 ${H - 2} L${W / 2} ${H * 0.55} L${W - 2.5} ${H - 2}`} fill="none" stroke={FOLD} strokeWidth="0.9" strokeLinejoin="round" />
        {/* 縁（左・下・右だけ。上の辺はふたの表の面が描く） */}
        <path d={`M0.7 0 V${H - 6.7} Q0.7 ${H - 0.7} 6.7 ${H - 0.7} H${W - 6.7} Q${W - 0.7} ${H - 0.7} ${W - 0.7} ${H - 6.7} V0`} fill="none" stroke={EDGE} strokeWidth="1.4" strokeLinejoin="round" />
      </svg>

      {/* 4. ふた。上の辺を軸に rotateX で開く。半分まで回ったところで便せんの後ろへ回る */}
      <span
        className="absolute left-0 top-0 block motion-reduce:transition-none"
        style={{
          width: W,
          height: FLAP_H,
          transformOrigin: "50% 0%",
          transformStyle: "preserve-3d",
          transform: open ? "rotateX(180deg)" : "rotateX(0deg)",
          zIndex: open ? 1 : 4,
          transition: open
            ? `transform ${t(FLAP_MS, FLAP_DELAY, "ease-in-out")}, z-index 0s linear ${FLAP_DELAY + FLAP_MS / 2}ms`
            : `transform ${t(FLAP_MS, 0, "ease-in-out")}, z-index 0s linear ${FLAP_MS / 2}ms`,
        }}
      >
        {/* 待っている間だけ、少し浮いて戻る（押せることの合図） */}
        <span className={`absolute inset-0 block ${open ? "" : "envelope-flap-idle"}`} style={{ transformOrigin: "50% 0%", transformStyle: "preserve-3d" }}>
          {/* 表の面（閉じているとき見える）。縁は上の辺と斜めの2辺（封筒の上の端の線はここが描く。開くと一緒に回って裏に隠れる） */}
          <svg viewBox={`0 0 ${W} ${FLAP_H}`} width={W} height={FLAP_H} className="absolute inset-0" style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
            <path d={flapPath(FLAP_H, 0)} fill={PAPER} />
            <path d={flapPath(FLAP_H - 0.8, 0.7)} fill="none" stroke={EDGE} strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
          {/* 裏の面（開いたとき見える）。★上下を反転して描く★ 開いたとき頂点が上の山形になる */}
          <span className="absolute inset-0 block" style={{ transform: "rotateX(180deg)", backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
            <svg viewBox={`0 0 ${W} ${FLAP_H}`} width={W} height={FLAP_H} className="absolute inset-0" style={{ transform: "scaleY(-1)" }}>
              <path d={flapPath(FLAP_H, 0)} fill={FLAP_BACK} />
              <path d={flapEdge(FLAP_H - 0.8, 0.7)} fill="none" stroke={EDGE} strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
          </span>
        </span>
      </span>

      {/* 5. 金のシール（呼び名の頭文字。平らな1色・つやなし）。開くと少し大きくなりながら消える。
            外側の箱は、待っている間ふたと一緒に浮く（軸 = ふたの上の辺）。内側の箱が、大きくなって消える動き */}
      <span
        className={`absolute block ${open ? "" : "envelope-flap-idle"}`}
        style={{ zIndex: 5, width: SEAL, height: SEAL, left: W / 2 - SEAL / 2, top: FLAP_H - SEAL / 2, transformOrigin: `50% ${-(FLAP_H - SEAL / 2)}px` }}
      >
        <span
          className="absolute inset-0 flex items-center justify-center rounded-full motion-reduce:transition-none"
          style={{
            background: INVITATION_COLORS.gold,
            transform: open ? "scale(1.3)" : "scale(1)",
            opacity: open ? 0 : 1,
            transition: `transform ${t(SEAL_MS)}, opacity ${t(SEAL_MS)}`,
          }}
        >
          <span className="absolute inset-[3px] block rounded-full" style={{ boxShadow: "inset 0 0 0 0.5px #f3e6cf" }} />
          <span className="relative font-serif text-[8.5px] font-semibold leading-none tracking-[0.02em]" style={{ color: "#fffaf0" }}>
            {GUESTBOOK_LOGO.left}
            {GUESTBOOK_LOGO.amp}
            {GUESTBOOK_LOGO.right}
          </span>
        </span>
      </span>
    </span>
  );
}
