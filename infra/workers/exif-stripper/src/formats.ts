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
const APP2 = 0xffe2;
const APP14 = 0xffee;
const COM = 0xfffe;
const SOS = 0xffda;
const EOI = 0xffd9;

function startsWithAscii(seg: Uint8Array, at: number, text: string): boolean {
  if (at + text.length > seg.length) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (seg[at + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * ★APPn は残すものだけを決める（許可リスト）★
 *   落とすものを列挙する方式だと、知らない APPn（APP3〜APP15）や COM に
 *   書かれたコメント・位置情報・機種固有の情報が素通りする。
 *   残すのは表示に必要なものだけ:
 *     APP0  JFIF / JFXX（基本情報）
 *     APP2  ICC_PROFILE（色。落とすと色がずれる）※ MPF（追加画像の索引）は落とす
 *     APP14 Adobe（CMYK などの色変換に必要）
 *   APP1（Exif・XMP）は Orientation だけを拾って作り直す。
 */
function keepJpegSegment(marker: number, seg: Uint8Array): boolean {
  if (marker === COM) return false;
  if (marker < APP0 || marker > 0xffef) return true; // DQT・SOF・DHT・DRI などの画像の本体
  if (marker === APP0) return startsWithAscii(seg, 4, "JFIF\0") || startsWithAscii(seg, 4, "JFXX\0");
  if (marker === APP2) return startsWithAscii(seg, 4, "ICC_PROFILE\0");
  if (marker === APP14) return startsWithAscii(seg, 4, "Adobe");
  return false;
}

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

/**
 * ★EOI（画像の終わり）で切り、その後ろは捨てる★
 *   iPhone などは EOI の後ろに2枚目の JPEG（MPF のゲインマップ・深度画像）を
 *   連結していて、そちらにも独自の Exif（位置情報を含むことがある）が入る。
 *   以前は SOS から末尾までを丸写ししていたため、これが公開側に残っていた。
 * ★SOS の後ろも読み進める★
 *   プログレッシブ JPEG は SOS が複数あり、間に DHT や（まれに）APPn・COM が挟まる。
 *   圧縮データの中の 0xFF は 0xFF00（スタッフィング）か RSTn なので、
 *   それ以外の 0xFF xx をマーカーとして扱う。
 */
function stripJpeg(b: Uint8Array): SanitizeResult {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const kept: Uint8Array[] = [];
  let orientation = 1;
  let p = 2;
  let sawSos = false;
  let sawEoi = false;

  while (p + 1 < b.length) {
    if (b[p] !== 0xff) return { status: "broken", reason: "JPEG のマーカーの位置が不正" };
    const m = b[p + 1];
    if (m === 0xff) {
      p += 1; // 詰め物の 0xFF
      continue;
    }
    const marker = 0xff00 | m;

    if (marker === EOI) {
      kept.push(b.subarray(p, p + 2));
      sawEoi = true;
      break; // ★ここより後ろ（連結された別の画像など）は捨てる★
    }
    if ((m >= 0xd0 && m <= 0xd7) || m === 0x01) {
      kept.push(b.subarray(p, p + 2)); // 長さを持たないマーカー
      p += 2;
      continue;
    }
    if (p + 4 > b.length) return { status: "broken", reason: "JPEG が途中で切れている" };

    const len = dv.getUint16(p + 2);
    if (len < 2) return { status: "broken", reason: "JPEG のセグメント長が不正" };
    const end = p + 2 + len;
    if (end > b.length) return { status: "broken", reason: "JPEG が途中で切れている" };

    const seg = b.subarray(p, end);
    if (marker === APP1) {
      // 落とす前に Orientation だけ拾っておく（最初の APP1 Exif を正とする）
      const o = readOrientation(seg);
      if (o !== 1 && orientation === 1) orientation = o;
    } else if (keepJpegSegment(marker, seg)) {
      kept.push(seg);
    }
    p = end;

    if (marker === SOS) {
      sawSos = true;
      // 圧縮データ: 次のマーカーの手前までをそのまま残す
      let q = p;
      while (q + 1 < b.length) {
        if (b[q] === 0xff) {
          const n = b[q + 1];
          if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) {
            q += 2;
            continue;
          }
          break;
        }
        q += 1;
      }
      if (q + 1 >= b.length) return { status: "broken", reason: "JPEG の終わり（EOI）が見つからない" };
      kept.push(b.subarray(p, q));
      p = q;
    }
  }

  if (!sawSos) return { status: "broken", reason: "JPEG の画像本体が見つからない" };
  if (!sawEoi) return { status: "broken", reason: "JPEG の終わり（EOI）が見つからない" };

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

/**
 * ★残すチャンクを決める（許可リスト）★
 *   eXIf・tEXt・iTXt・zTXt・tIME や、アプリ独自のチャンクはすべて落とす。
 *   表示に要るもの（色・透過・解像度・APNG のアニメーション）だけを残す。
 */
const PNG_KEEP = new Set([
  "IHDR", "PLTE", "IDAT", "IEND",
  "tRNS", "cHRM", "gAMA", "iCCP", "sBIT", "sRGB", "cICP", "mDCv", "cLLi",
  "bKGD", "pHYs", "sPLT", "hIST",
  "acTL", "fcTL", "fdAT",
]);

/** 1文字目が大文字のチャンクは必須チャンク。知らない必須チャンクを落とすと画像が壊れる */
function isCriticalPngChunk(type: string): boolean {
  const c = type.charCodeAt(0);
  return c >= 0x41 && c <= 0x5a;
}

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
    if (p === 8 && type !== "IHDR") return { status: "broken", reason: "PNG の先頭が IHDR ではない" };
    // チャンクごと丸写しするので CRC の再計算は不要
    if (PNG_KEEP.has(type)) {
      parts.push(b.subarray(p, end));
    } else if (isCriticalPngChunk(type)) {
      return { status: "broken", reason: `PNG に未知の必須チャンク（${type}）がある` };
    } else {
      dropped += 1;
    }
    p = end;
    if (type === "IEND") {
      sawIend = true;
      break; // IEND より後ろは捨てる
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

/** ★残すチャンクを決める（許可リスト）★ EXIF・XMP・独自チャンクは落とす */
const WEBP_KEEP = new Set(["VP8 ", "VP8L", "VP8X", "ALPH", "ANIM", "ANMF", "ICCP"]);

function stripWebp(b: Uint8Array): SanitizeResult {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const chunks: Uint8Array[] = [];
  // ★RIFF が名乗る長さまでだけを読む★ その後ろに連結されたデータは捨てる
  const riffEnd = 8 + dv.getUint32(4, true);
  if (riffEnd > b.length) return { status: "broken", reason: "WebP が途中で切れている" };
  let p = 12; // "RIFF" + size + "WEBP"
  let vp8xAt = -1;
  let dropped = 0;

  while (p + 8 <= riffEnd) {
    const cc = fourcc(b, p);
    const size = dv.getUint32(p + 4, true); // RIFF はリトルエンディアン
    const padded = size + (size % 2); // 奇数長は1バイト詰める
    const end = p + 8 + padded;
    if (size > b.length || end > riffEnd) {
      return { status: "broken", reason: "WebP のチャンク長が不正" };
    }
    if (WEBP_KEEP.has(cc)) {
      if (cc === "VP8X") vp8xAt = chunks.length;
      chunks.push(b.subarray(p, end));
    } else {
      dropped += 1;
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

function sanitizeByFormat(b: Uint8Array, format: Format): SanitizeResult {
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

function countAscii(b: Uint8Array, text: string): number {
  const first = text.charCodeAt(0);
  let n = 0;
  outer: for (let i = b.indexOf(first); i !== -1 && i + text.length <= b.length; i = b.indexOf(first, i + 1)) {
    for (let j = 1; j < text.length; j += 1) {
      if (b[i + j] !== text.charCodeAt(j)) continue outer;
    }
    n += 1;
  }
  return n;
}

/**
 * 除去の結果を、公開する前にもう一度確かめる。合格しなければ公開しない。
 *   (1) 形式が入力と同じ
 *   (2) もう一度かけても変わらない（＝落とすべきものが残っていない）
 *   (3) Exif・XMP の署名が残っていない（JPEG は作り直した Orientation の1つだけ許す）
 */
function verify(out: Uint8Array, format: Format): string | null {
  if (detect(out) !== format) return "出力の形式が入力と違う";

  const again = sanitizeByFormat(out, format);
  if (again.status !== "ok") return `出力をもう一度解析できない（${again.reason}）`;
  if (again.out.length !== out.length || again.out.some((v, i) => v !== out[i])) {
    return "出力にまだ除去できるものが残っている";
  }

  const exif = countAscii(out, "Exif\0\0");
  if (exif > (format === "jpeg" ? 1 : 0)) return "Exif が残っている";
  if (countAscii(out, "http://ns.adobe.com/xap/1.0/") > 0 || countAscii(out, "<x:xmpmeta") > 0) {
    return "XMP が残っている";
  }
  if (format === "jpeg" && (out[out.length - 2] !== 0xff || out[out.length - 1] !== 0xd9)) {
    return "JPEG が EOI で終わっていない";
  }
  return null;
}

/**
 * ★フェイルセーフの入口★ ここが "ok" を返したものだけが公開バケットへ出る。
 *   - 解析中の例外（壊れたファイルで範囲外を読むなど）は "broken" にする。
 *     投げたままにすると run ごと止まり、同じファイルで毎回止まる。
 *   - 除去の結果を verify() で確かめ、不合格なら "broken" にする（隔離されて公開されない）。
 */
export function sanitize(b: Uint8Array): SanitizeResult {
  try {
    const format = detect(b);
    const result = sanitizeByFormat(b, format);
    if (result.status !== "ok") return result;
    const problem = verify(result.out, format);
    if (problem) return { status: "broken", reason: `除去後の検証で不合格: ${problem}` };
    return result;
  } catch {
    return { status: "broken", reason: "解析中に例外が起きた" };
  }
}
