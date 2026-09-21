/**
 * 画像からメタデータを取り除く。
 *
 * ★再エンコードしない★
 *   画素には一切触れず、コンテナのセグメント／チャンク境界だけを操作する。
 *   Worker の CPU・メモリ制限の中で、数MBの写真でも一瞬で終わる。
 *
 * ★形式は拡張子ではなくマジックバイトで判定する★
 *   拡張子は名乗っているだけで、中身の保証にならない。
 */

export type Format = "jpeg" | "png" | "webp" | "heif" | "unknown";

export type SanitizeResult =
  | { status: "ok"; out: Uint8Array; contentType: string; note: string }
  | { status: "unsupported"; reason: string }
  | { status: "broken"; reason: string };

function fourcc(b: Uint8Array, at: number): string {
  if (at + 4 > b.length) return "";
  return String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
}

const HEIF_BRANDS = new Set([
  "heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs",
  "mif1", "msf1", "avif", "avis",
]);

export function detect(b: Uint8Array): Format {
  if (b.length < 16) return "unknown";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return "png";
  }
  if (fourcc(b, 0) === "RIFF" && fourcc(b, 8) === "WEBP") return "webp";
  if (fourcc(b, 4) === "ftyp" && HEIF_BRANDS.has(fourcc(b, 8))) return "heif";
  return "unknown";
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, s) => n + s.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const s of parts) {
    out.set(s, off);
    off += s.length;
  }
  return out;
}

// ───────────────────────── JPEG ─────────────────────────

const APP0 = 0xffe0;
const APP1 = 0xffe1;
const APP13 = 0xffed;
const SOS = 0xffda;
const EOI = 0xffd9;

/** APP1(Exif) から Orientation(0x0112) を読む。見つからなければ 1 */
function readOrientation(seg: Uint8Array): number {
  if (seg.length < 24) return 1;
  const dv = new DataView(seg.buffer, seg.byteOffset, seg.byteLength);
  if (dv.getUint32(4) !== 0x45786966 || dv.getUint16(8) !== 0x0000) return 1;
  const tiff = 10;
  try {
    const le = dv.getUint16(tiff) === 0x4949;
    if (dv.getUint16(tiff + 2, le) !== 0x002a) return 1;
    const ifd0 = tiff + dv.getUint32(tiff + 4, le);
    if (ifd0 + 2 > seg.length) return 1;
    const count = dv.getUint16(ifd0, le);
    for (let i = 0; i < count; i += 1) {
      const e = ifd0 + 2 + i * 12;
      if (e + 12 > seg.length) break;
      if (dv.getUint16(e, le) === 0x0112) {
        const v = dv.getUint16(e + 8, le);
        return v >= 1 && v <= 8 ? v : 1;
      }
    }
  } catch {
    /* 壊れた Exif は 1 扱いにする */
  }
  return 1;
}

/** Orientation だけを持つ最小の APP1（36 バイト）を組み立てる */
function orientationApp1(orientation: number): Uint8Array {
  const seg = new Uint8Array(36);
  const dv = new DataView(seg.buffer);
  dv.setUint16(0, APP1);
  dv.setUint16(2, 34); // このフィールド自身を含む長さ
  seg.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 4); // "Exif\0\0"
  seg.set([0x49, 0x49, 0x2a, 0x00], 10); // TIFF ヘッダ（リトルエンディアン）
  dv.setUint32(14, 8, true); // IFD0 のオフセット
  dv.setUint16(18, 1, true); // エントリ数
  dv.setUint16(20, 0x0112, true); // タグ = Orientation
  dv.setUint16(22, 3, true); // 型 = SHORT
  dv.setUint32(24, 1, true); // 個数
  dv.setUint16(28, orientation, true); // 値
  dv.setUint32(32, 0, true); // 次の IFD なし
  return seg;
}

function stripJpeg(b: Uint8Array): SanitizeResult {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const kept: Uint8Array[] = [];
  let orientation = 1;
  let p = 2;
  let sawSos = false;

  while (p + 1 < b.length) {
    if (dv.getUint8(p) !== 0xff) break;
    const marker = dv.getUint16(p);

    if (marker === SOS) {
      kept.push(b.subarray(p)); // 圧縮データ本体は最後までそのまま
      sawSos = true;
      break;
    }
    if (marker === EOI) {
      kept.push(b.subarray(p, p + 2));
      break;
    }
    if (p + 4 > b.length) break;

    const len = dv.getUint16(p + 2);
    if (len < 2) return { status: "broken", reason: "JPEG のセグメント長が不正" };
    const end = p + 2 + len;
    if (end > b.length) return { status: "broken", reason: "JPEG が途中で切れている" };

    const seg = b.subarray(p, end);
    if (marker === APP1) {
      // 落とす前に Orientation だけ拾っておく
      const o = readOrientation(seg);
      if (o !== 1) orientation = o;
    } else if (marker !== APP13) {
      kept.push(seg);
    }
    p = end;
  }

  if (!sawSos) return { status: "broken", reason: "JPEG の画像本体が見つからない" };

  // JFIF(APP0) の直後に Orientation を置く
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let i = 0;
  while (i < kept.length && kept[i].length >= 2 && ((kept[i][0] << 8) | kept[i][1]) === APP0) {
    parts.push(kept[i]);
    i += 1;
  }
  if (orientation !== 1) parts.push(orientationApp1(orientation));
  for (; i < kept.length; i += 1) parts.push(kept[i]);

  const out = concat(parts);
  if (out.length < 100 || out[0] !== 0xff || out[1] !== 0xd8) {
    return { status: "broken", reason: "組み立て結果が JPEG として不正" };
  }
  return {
    status: "ok",
    out,
    contentType: "image/jpeg",
    note: `orientation=${orientation}`,
  };
}

// ───────────────────────── PNG ─────────────────────────

/** 位置情報やコメントが入りうるチャンク。iCCP(色) は残す */
const PNG_DROP = new Set(["eXIf", "tEXt", "iTXt", "zTXt", "tIME"]);

function stripPng(b: Uint8Array): SanitizeResult {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const parts: Uint8Array[] = [b.subarray(0, 8)]; // シグネチャ
  let p = 8;
  let sawIend = false;
  let dropped = 0;

  while (p + 12 <= b.length) {
    const len = dv.getUint32(p);
    const type = fourcc(b, p + 4);
    const end = p + 12 + len; // 長さ4 + 種別4 + データ + CRC4
    if (len > b.length || end > b.length) {
      return { status: "broken", reason: "PNG のチャンク長が不正" };
    }
    // チャンクごと丸写しするので CRC の再計算は不要
    if (PNG_DROP.has(type)) dropped += 1;
    else parts.push(b.subarray(p, end));
    p = end;
    if (type === "IEND") {
      sawIend = true;
      break;
    }
  }

  if (!sawIend) return { status: "broken", reason: "PNG の IEND が見つからない" };
  return {
    status: "ok",
    out: concat(parts),
    contentType: "image/png",
    note: `dropped=${dropped}chunks`,
  };
}

// ───────────────────────── WebP ─────────────────────────

const WEBP_DROP = new Set(["EXIF", "XMP "]);

function stripWebp(b: Uint8Array): SanitizeResult {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const chunks: Uint8Array[] = [];
  let p = 12; // "RIFF" + size + "WEBP"
  let vp8xAt = -1;
  let dropped = 0;

  while (p + 8 <= b.length) {
    const cc = fourcc(b, p);
    const size = dv.getUint32(p + 4, true); // RIFF はリトルエンディアン
    const padded = size + (size % 2); // 奇数長は1バイト詰める
    const end = p + 8 + padded;
    if (size > b.length || end > b.length) {
      return { status: "broken", reason: "WebP のチャンク長が不正" };
    }
    if (WEBP_DROP.has(cc)) {
      dropped += 1;
    } else {
      if (cc === "VP8X") vp8xAt = chunks.length;
      chunks.push(b.subarray(p, end));
    }
    p = end;
  }

  if (chunks.length === 0) return { status: "broken", reason: "WebP のチャンクが無い" };

  // ★VP8X のフラグも落とす★
  //   EXIF/XMP を消したのにフラグが立ったままだと、
  //   デコーダが存在しないチャンクを探しにいく。
  if (vp8xAt >= 0 && chunks[vp8xAt].length > 8) {
    const copy = new Uint8Array(chunks[vp8xAt]);
    copy[8] = copy[8] & ~0x0c; // bit3=EXIF, bit2=XMP
    chunks[vp8xAt] = copy;
  }

  const bodyLen = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(12 + bodyLen);
  const odv = new DataView(out.buffer);
  out.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  odv.setUint32(4, 4 + bodyLen, true); // "WEBP" + チャンク群の長さ
  out.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  let off = 12;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }

  return {
    status: "ok",
    out,
    contentType: "image/webp",
    note: `dropped=${dropped}chunks`,
  };
}

// ───────────────────────── 入口 ─────────────────────────

export function sanitize(b: Uint8Array): SanitizeResult {
  const format = detect(b);
  switch (format) {
    case "jpeg":
      return stripJpeg(b);
    case "png":
      return stripPng(b);
    case "webp":
      return stripWebp(b);
    case "heif":
      /**
       * ★HEIC/HEIF/AVIF は意図的に処理しない★
       *   ISOBMFF では EXIF を外すと mdat のバイト位置が動き、
       *   すべての iloc オフセットを書き直す必要がある。
       *   1箇所でもずれると「一部のビューアでだけ壊れる」という
       *   最悪の形になる。
       *   そもそもブラウザは HEIC を表示できないので、
       *   公開する価値がないものに壊すリスクを負う理由がない。
       */
      return {
        status: "unsupported",
        reason: "HEIF系（ブラウザで表示できないため公開しない）",
      };
    default:
      return { status: "unsupported", reason: "未知の形式" };
  }
}
