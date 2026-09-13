import { GenerateReplyInput, LlmProvider } from "./types";
import { buildSystemPromptAsync, wrapUserMessage } from "./promptBuilder";
import { checkFastPathMatch } from "./fastPath";

/**
 * Provider DeepSeek (usato nell'app originale DeepSeek API sk-e70b7... brief slide 5).
 * Utilizza fetch HTTP diretto verso l'endpoint ufficiale DeepSeek API.
 */
export class DeepSeekProvider implements LlmProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = "deepseek-chat") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateReply(input: GenerateReplyInput): Promise<string> {
    // Fast-Path Latency Check (<5ms)
    const fastCheck = checkFastPathMatch(input.incomingMessage);
    if (fastCheck.matched && fastCheck.replyText) {
      return fastCheck.replyText;
    }

    const system = await buildSystemPromptAsync(input);

    // Compressione cronologia: mantiene solo gli ultimi 6 turni per accelerare l'elaborazione dei token
    const compressedHistory = input.history.slice(-6);

    const messages = [
      { role: "system", content: system },
      ...compressedHistory.map((turn) => ({
        role: turn.role,
        content: turn.role === "user" ? wrapUserMessage(turn.content) : turn.content,
      })),
      { role: "user", content: wrapUserMessage(input.incomingMessage) },
    ];

    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages, max_tokens: 600 }),
    });

    if (!res.ok) {
      throw new Error(`DeepSeek API error: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as any;
    return data.choices?.[0]?.message?.content ?? "";
  }

  async generateRaw(prompt: string): Promise<string> {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages: [{ role: "user", content: prompt }], max_tokens: 2000 }),
    });
    if (!res.ok) throw new Error(`DeepSeek API error: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as any;
    return data.choices?.[0]?.message?.content ?? "";
  }
}
