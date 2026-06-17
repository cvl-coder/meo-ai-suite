import { getMeoToken, isMeoTokenValid } from "./meoToken";

export const MEO_AI_CHAT_ENDPOINT = "https://new-api.meo.io/ai/chat";

export type MeoChatArgs = {
  system: string;
  user: string;
  model: string;
};

export type MeoChatResult = {
  text: string;
  raw: unknown;
};

function extractText(payload: any): string {
  if (!payload) return "";
  // OpenAI shape
  const choiceContent = payload?.choices?.[0]?.message?.content;
  if (typeof choiceContent === "string") return choiceContent;
  // Common fallbacks
  if (typeof payload?.output === "string") return payload.output;
  if (typeof payload?.text === "string") return payload.text;
  if (typeof payload?.message === "string") return payload.message;
  if (typeof payload?.content === "string") return payload.content;
  // Last resort — stringify so contract drift is visible instead of silently empty
  try {
    return JSON.stringify(payload);
  } catch {
    return "";
  }
}

export async function callMeoAiChat({ system, user, model }: MeoChatArgs): Promise<MeoChatResult> {
  const token = getMeoToken();
  if (!token || !isMeoTokenValid()) {
    throw new Error("Your MEO session has expired. Please sign in again.");
  }

  const response = await fetch(MEO_AI_CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      stream: false,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`AI error (${response.status}): ${errText.substring(0, 300)}`);
  }

  const raw = await response.json();
  const text = extractText(raw);
  return { text, raw };
}
