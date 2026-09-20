export type AiTestUsage = { prompt: number; output: number };

export type ChatTurn = { role: "user" | "model"; text: string };

type AiStreamEvent =
  | { type: "meta"; model: string; debug: unknown }
  | { type: "chunk"; text: string }
  | { type: "done"; text: string; usage: AiTestUsage }
  | { type: "error"; message: string };

export type StreamAiTestArgs = {
  idToken: string;
  guestUid: string;
  message: string;
  basePrompt: string;
  history: ChatTurn[];
  signal?: AbortSignal;
  onMeta?: (meta: { model: string; debug: unknown }) => void;
  /** チャンクが届くたびに呼ばれる。chunk=今回の差分 / full=ここまでの全文 */
  onChunk?: (chunk: string, full: string) => void;
};

/**
 * /api/admin/ai-test の NDJSON ストリームを読む。
 * 最後に全文と usage を返すので、await すれば従来の一括呼び出しと同じ使い方もできる。
 */
export async function streamAiTest(
  args: StreamAiTestArgs,
): Promise<{ text: string; usage: AiTestUsage }> {
  const res = await fetch("/api/admin/ai-test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.idToken}`,
    },
    body: JSON.stringify({
      guestUid: args.guestUid,
      message: args.message,
      basePrompt: args.basePrompt,
      history: args.history,
    }),
    signal: args.signal,
  });

  // ストリーム開始前のエラーは通常の JSON で返ってくる
  const ct = res.headers.get("content-type") ?? "";
  if (!res.ok || !ct.includes("ndjson")) {
    const raw = await res.text();
    let msg = raw;
    try {
      const j = JSON.parse(raw) as { message?: string; error?: string };
      msg = j.message ?? j.error ?? raw;
    } catch {
      /* 空ボディの 500 などはそのまま */
    }
    throw new Error(msg || `通信に失敗しました (${res.status})`);
  }
  if (!res.body) throw new Error("ストリームを取得できませんでした");

  const reader = res.body.getReader();
  // stream:true を付けないと、日本語がチャンク境界で文字化けする
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  let usage: AiTestUsage = { prompt: 0, output: 0 };

  const handleLine = (line: string) => {
    const s = line.trim();
    if (!s) return;
    let ev: AiStreamEvent;
    try {
      ev = JSON.parse(s) as AiStreamEvent;
    } catch {
      return;
    }
    if (ev.type === "meta") {
      args.onMeta?.({ model: ev.model, debug: ev.debug });
    } else if (ev.type === "chunk") {
      full += ev.text;
      args.onChunk?.(ev.text, full);
    } else if (ev.type === "done") {
      full = ev.text || full;
      usage = ev.usage;
    } else if (ev.type === "error") {
      throw new Error(ev.message);
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx = buf.indexOf("\n");
      while (idx >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        handleLine(line);
        idx = buf.indexOf("\n");
      }
    }
    buf += decoder.decode();
    if (buf.trim()) handleLine(buf);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* noop */
    }
  }

  return { text: full, usage };
}
