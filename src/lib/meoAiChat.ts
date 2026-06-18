import { getMeoToken, isMeoTokenValid } from "./meoToken";

export const MEO_AI_CHAT_ENDPOINT = "https://new-api.meo.io/ai/chat";

export type MeoChatArgs = {
  system: string;
  user: string;
  model: string;
  customerId?: string;
};

export type MeoChatResult = {
  text: string;
  raw: unknown;
};

function extractText(payload: any): string {
  if (!payload) return "";
  // Ollama shape
  const msgContent = payload?.message?.content;
  if (typeof msgContent === "string") return msgContent;
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

export async function callMeoAiChat({ system, user, model, customerId }: MeoChatArgs): Promise<MeoChatResult> {
  const token = getMeoToken();
  if (!token || !isMeoTokenValid()) {
    throw new Error("Your MEO session has expired. Please sign in again.");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  if (customerId) {
    headers["X-Customer-Id"] = customerId;
  }

  const body = JSON.stringify({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    stream: false,
  });

  const sysChars = system.length;
  const userChars = user.length;
  const bodyBytes = new Blob([body]).size;
  const label = `[meo-ai] ${model}`;
  console.log(
    `${label} → POST ${MEO_AI_CHAT_ENDPOINT}\n  system=${sysChars} chars, user=${userChars} chars, body=${bodyBytes} B${customerId ? `, customer=${customerId}` : ""}`
  );

  const t0 = performance.now();
  const response = await fetch(MEO_AI_CHAT_ENDPOINT, {
    method: "POST",
    headers,
    body,
  });
  const tHeaders = performance.now();

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.warn(`${label} ✗ ${response.status} in ${(tHeaders - t0).toFixed(0)}ms`);
    if (response.status === 401) {
      throw new Error(`AI error (401): The new MEO AI endpoint rejected the current MEO session token${customerId ? " for this workspace" : ""}.`);
    }
    throw new Error(`AI error (${response.status}): ${errText.substring(0, 300)}`);
  }

  const raw = await response.json();
  const tBody = performance.now();
  const text = extractText(raw);
  const usage = (raw as any)?.usage;
  console.log(
    `${label} ✓ ${response.status} | headers=${(tHeaders - t0).toFixed(0)}ms, body=${(tBody - tHeaders).toFixed(0)}ms, total=${(tBody - t0).toFixed(0)}ms | out=${text.length} chars` +
      (usage ? ` | usage=${JSON.stringify(usage)}` : "")
  );
  return { text, raw };
}
