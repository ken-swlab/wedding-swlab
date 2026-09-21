/**
 * ミニ AI の「人格」を構造化して持つ。
 *
 * ★フリーテキスト1枚から、選択式＋自由記述の組み立てに変える★
 *   誰が喋っているか（新郎 / 新婦）は、呼び名の解決にも使うため
 *   プロンプト文字列ではなく構造化された値として API にも渡す。
 *
 * このファイルはクライアントからもサーバー（Route Handler）からも
 * import されるので、ブラウザ API に依存させないこと。
 */

export type Speaker = "groom" | "bride";
export type Politeness = "casual" | "polite";

export type PersonaConfig = {
  speaker: Speaker;
  politeness: Politeness;
  /** 一人称。選択肢のほか自由入力も許す */
  firstPerson: string;
  /** 性格プリセット（複数選択可） */
  presetIds: string[];
  /** 追加の自由記述 */
  freeText: string;
};

export const SPEAKER_OPTIONS: { id: Speaker; label: string }[] = [
  { id: "groom", label: "新郎" },
  { id: "bride", label: "新婦" },
];

export const POLITENESS_OPTIONS: { id: Politeness; label: string; hint: string }[] = [
  { id: "casual", label: "タメ語", hint: "友達と話すテンポ" },
  { id: "polite", label: "敬語", hint: "親族・上司向け" },
];

export const FIRST_PERSON_PRESETS = ["俺", "僕", "私", "わたし"];

export const PERSONALITY_PRESETS: { id: string; label: string; text: string }[] = [
  {
    id: "tease",
    label: "いじり・照れ隠し",
    text: "ゲストをいじったり、照れ隠しでふざけたりするのは大歓迎です。",
  },
  {
    id: "cheerful",
    label: "陽気・馴れ馴れしい",
    text: "少し陽気で、馴れ馴れしい人です。距離を詰めて話します。",
  },
  {
    id: "sincere",
    label: "まじめ・丁寧",
    text: "まじめで、丁寧な性格です。落ち着いた受け答えをします。",
  },
];

export const DEFAULT_PERSONA: PersonaConfig = {
  speaker: "groom",
  politeness: "casual",
  firstPerson: "俺",
  presetIds: ["tease"],
  freeText: "",
};

/**
 * 姓名から下の名前を取り出す。
 * 「山田 太郎」「山田　太郎」→「太郎」。区切りが無ければそのまま返す。
 * 呼び名が未設定のときのフォールバックに使う。
 */
export function givenName(fullName: string): string {
  const parts = (fullName || "").trim().split(/[\s\u3000]+/).filter(Boolean);
  if (parts.length === 0) return "";
  return parts[parts.length - 1];
}

/** 構造化された人格から、システムプロンプトの前半（ベース人格）を組み立てる */
export function composePersonaPrompt(p: PersonaConfig): string {
  const role = p.speaker === "bride" ? "新婦" : "新郎";
  const first = (p.firstPerson || "").trim() || (p.speaker === "bride" ? "私" : "俺");

  const lines = [`あなたは${role}です。一人称は「${first}」。`];

  lines.push(
    p.politeness === "polite"
      ? "敬語で、落ち着いた丁寧な言葉づかいで返してください。"
      : "タメ口で、友達と話すみたいにフランクに返してください。",
  );
  lines.push("披露宴の会場で立ち話をしている感覚です。短く軽快に。");

  for (const id of p.presetIds) {
    const preset = PERSONALITY_PRESETS.find((x) => x.id === id);
    if (preset) lines.push(preset.text);
  }

  const free = (p.freeText || "").trim();
  if (free) lines.push(free);

  return lines.join("\n");
}
