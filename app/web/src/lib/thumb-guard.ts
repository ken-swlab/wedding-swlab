/**
 * 公開バケットへ送る軽量版（写真・アイコン）の最終確認。
 *
 * ★軽量版は必ず canvas で作り直したものだけを送る★
 *   軽量版は公開バケットに直接入り、Worker（exif-stripper）を通らない。
 *   元の写真（iPhone なら GPS 入り）をそのまま渡すと、どこでも止まらずに公開される。
 *   なので型（ReencodedJpeg）で「image.ts の圧縮を通ったもの」しか受け取れないようにし、
 *   送る直前にも中身を軽く確かめる（多層防御。Issue #66）。
 *
 * ★ブラウザでは EXIF を「読むだけ」★
 *   書き換えや削除は Worker の sanitize() の仕事（HEIC でブラウザが落ちるため。CLAUDE.md ルール 11）。
 *   ここでは canvas が出した JPEG の先頭のセグメントを見て、GPS の IFD があれば止めるだけにする。
 *   色空間・画素数だけの Exif や空の IPTC は iOS のエンコーダーが付けるもので、止めない。
 */

declare const reencodedBrand: unique symbol;

/** canvas で JPEG に作り直した軽量版。image.ts の圧縮関数だけが作る */
export type ReencodedJpeg = Blob & { readonly [reencodedBrand]: true };

/**
 * 圧縮ライブラリの出力を、元のファイルと切り離した Blob にして印を付ける。
 * ★new Blob で包み直す★ ライブラリの版が変わって File（や元のファイルそのもの）を
 *   返すようになっても、ここを通ったものは File ではない、という前提を崩さないため。
 */
export function markReencoded(out: Blob): ReencodedJpeg {
  return new Blob([out], { type: "image/jpeg" }) as ReencodedJpeg;
}

/** ヘッダを読む範囲。canvas の出力なら SOS（画像データの始まり）までは数 KB に収まる */
const HEADER_SCAN_BYTES = 128 * 1024;
const TAG_GPS_IFD = 0x8825;

/**
 * 送ってよい軽量版かを確かめる。だめなら投げる（文言はそのまま画面に出してよいもの）。
 * - File そのもの（ゲストが選んだ元の写真）ではないこと
 * - JPEG であること
 * - Exif に GPS の IFD が無いこと（SOS までに読み切れなければ、安全側に倒して止める）
 */
export async function assertSafeThumb(blob: Blob): Promise<void> {
  if (typeof File !== "undefined" && blob instanceof File) {
    throw new Error("元の写真はそのまま公開できません。もう一度選び直してください");
  }

  const view = new DataView(await blob.slice(0, HEADER_SCAN_BYTES).arrayBuffer());
  const verdict = scanJpegHeader(view);
  if (verdict === "ok") return;

  console.error("[thumb-guard] 軽量版の確認で止めました", verdict);
  throw new Error("写真を安全に処理できませんでした。もう一度選び直してください");
}

type Verdict = "ok" | "not-jpeg" | "gps" | "truncated";

function scanJpegHeader(v: DataView): Verdict {
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return "not-jpeg";

  let off = 2;
  while (off + 4 <= v.byteLength) {
    if (v.getUint8(off) !== 0xff) return "not-jpeg";
    const marker = v.getUint8(off + 1);
    // 埋め草の 0xFF は読み飛ばす
    if (marker === 0xff) {
      off += 1;
      continue;
    }
    // SOS より後は画像データなので、ここまでにメタデータは出そろう
    if (marker === 0xda) return "ok";
    // 長さを持たないマーカー（RSTn・TEM）
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      off += 2;
      continue;
    }

    const len = v.getUint16(off + 2);
    if (len < 2) return "not-jpeg";
    const start = off + 4;
    const end = off + 2 + len;
    if (end > v.byteLength) return "truncated";

    // APP1 "Exif\0\0"
    if (marker === 0xe1 && end - start >= 6 && v.getUint32(start) === 0x45786966 && v.getUint16(start + 4) === 0) {
      if (exifHasGps(v, start + 6, end)) return "gps";
    }
    off = end;
  }
  return "truncated";
}

/** IFD0 に GPS の IFD へのポインタがあるか。読めない Exif も安全側に倒して true にする */
function exifHasGps(v: DataView, tiff: number, end: number): boolean {
  if (tiff + 8 > end) return true;
  const order = v.getUint16(tiff);
  if (order !== 0x4949 && order !== 0x4d4d) return true;
  const le = order === 0x4949;
  if (v.getUint16(tiff + 2, le) !== 42) return true;

  const ifd0 = tiff + v.getUint32(tiff + 4, le);
  if (ifd0 + 2 > end) return true;
  const count = v.getUint16(ifd0, le);
  if (ifd0 + 2 + count * 12 > end) return true;

  for (let i = 0; i < count; i++) {
    if (v.getUint16(ifd0 + 2 + i * 12, le) === TAG_GPS_IFD) return true;
  }
  return false;
}
