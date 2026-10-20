import type { CSSProperties, ReactNode } from "react";
import { INVITATION_COLORS } from "@/config/invitation";
import { programTime, shortDateLabel } from "@/lib/invitation-program";
import type { ProgramItem } from "@/types/invitation";

/** 時刻の列の幅と、点の左の余白 (px)。縦線はちょうど点の中心を通す */
const TIME_COL_PX = 56;
const DOT_GAP_PX = 5;
const DOT_PX = 12;
const LINE_PX = 1;

/**
 * 招待状の PROGRAM（当日の流れ。Issue #166）。時刻・点・項目名・補足を縦に並べる。
 * 点をつなぐ縦線は薄いベージュの細い1本。★点は金の1色だけ★（Issue #189）挙式・披露宴（highlight）は塗り、
 * それ以外は中抜きの細い線。
 * ★時刻は明朝★（Issue #189）隣の予定名と同じ書体にそろえる。MONO（電光掲示板の書体）は黒の画面だけで使う。
 * ★中身は config/invitation の program だけ★ 時刻をコードに書かない。
 */
export function ProgramList({ program }: { program: readonly ProgramItem[] }) {
  const lineLeft = TIME_COL_PX + DOT_GAP_PX + DOT_PX / 2 - LINE_PX / 2;
  return (
    <div className="relative mx-1.5">
      <span aria-hidden className="absolute bottom-2 top-2" style={{ left: lineLeft, width: LINE_PX, background: INVITATION_COLORS.line }} />
      <ol>
        {program.map((row, i) => {
          const dot: CSSProperties = row.highlight
            ? { background: INVITATION_COLORS.gold, borderColor: INVITATION_COLORS.gold }
            : { background: INVITATION_COLORS.paper, borderColor: INVITATION_COLORS.gold };
          return (
            <li key={i} className="relative flex items-center py-3">
              <span className="shrink-0 whitespace-nowrap text-right font-serif text-[17px] font-medium tabular-nums text-stone-600" style={{ width: TIME_COL_PX }}>
                {programTime(row)}
              </span>
              <span aria-hidden className="relative z-[1] shrink-0 rounded-full border-[1.5px]" style={{ ...dot, width: DOT_PX, height: DOT_PX, marginLeft: DOT_GAP_PX }} />
              <span className="ml-4 min-w-0 text-left">
                <span className="block font-serif text-[16px] font-semibold text-stone-800">{row.title}</span>
                {row.note && <span className="block text-[12px] leading-relaxed text-stone-500">{row.note}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * エントリー画面（回答フォーム）の上部に固定する当日の流れ（Issue #166）。「何時からだっけ？」で招待状へ戻らなくてよいように。
 * 小さく「PROGRAM 日付 ／ 会場」と、時刻と項目名のチップを横に並べる。幅が足りなければチップの列だけ横にスクロールする
 * （スクロールバーは出さない）。挙式・披露宴のチップは枠を金にする。時刻と項目名は明朝（招待状の PROGRAM と同じ書体。Issue #189）。
 * ★sticky の位置は呼び出し側が決める★（招待状は画面の上端、回答の修正はヘッダーの下）。className で top を渡す。
 */
export function ProgramStrip({
  program,
  date,
  venue,
  className = "",
  style,
  action,
}: {
  program: readonly ProgramItem[];
  /** config/invitation の opening.date（例: 20XX.X.XX）。年を除いて曜日を添える */
  date: string;
  /** config/invitation の opening.venue（短い表記） */
  venue: string;
  className?: string;
  style?: CSSProperties;
  /** 右上に置くボタン（招待状へ戻る など） */
  action?: ReactNode;
}) {
  return (
    <div
      className={`sticky z-30 border-b border-stone-200/80 px-3.5 pb-2.5 pt-2 backdrop-blur ${className}`}
      style={{ background: `${INVITATION_COLORS.paper}f0`, ...style }}
    >
      <div className="flex min-h-7 items-center gap-2">
        <p className="min-w-0 flex-1 truncate font-serif text-[10px] tracking-[0.35em] text-stone-500">
          PROGRAM {shortDateLabel(date)} ／ {venue}
        </p>
        {action}
      </div>
      <ul aria-label="当日の流れ" className="mt-1 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {program.map((row, i) => (
          <li
            key={i}
            className="shrink-0 whitespace-nowrap rounded-full border border-stone-200 bg-white px-2.5 py-1 font-serif text-xs text-stone-700"
            style={row.highlight ? { borderColor: INVITATION_COLORS.gold, background: INVITATION_COLORS.goldSoft } : undefined}
          >
            <span className="mr-1 font-medium tabular-nums text-stone-600">{programTime(row)}</span>
            <span className="font-semibold">{row.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
