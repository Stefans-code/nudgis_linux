import { GenerateReplyInput, LlmProvider } from "./types";
import { buildSystemPromptAsync, wrapUserMessage } from "./promptBuilder";
import { checkFastPathMatch } from "./fastPath";

/**
 * Provider OpenAI con ottimizzazioni Fast-Path (<5ms), RAM Prompt Cache, Content Matcher e History Truncation.
 */
export class OpenAiProvider implements LlmProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateReply(input: GenerateReplyInput): Promise<string> {
    // Fast-Path Check (<5ms)
    const fastCheck = checkFastPathMatch(input.incomingMessage);
    if (fastCheck.matched && fastCheck.replyText) {
      return fastCheck.replyText;
    }

    const system = await buildSystemPromptAsync(input);
    const compressedHistory = input.history.slice(-6);

    const messages = [
      { role: "system", content: system },
      ...compressedHistory.map((turn) => ({
        role: turn.role,
        content: turn.role === "user" ? wrapUserMessage(turn.content) : turn.content,
      })),
      { role: "user", content: wrapUserMessage(input.incomingMessage) },
    ];

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages, max_tokens: 500 }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as any;
    return data.choices?.[0]?.message?.content ?? "";
  }

  async generateRaw(prompt: string): Promise<string> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages: [{ role: "user", content: prompt }], max_tokens: 2000 }),
    });
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as any;
    return data.choices?.[0]?.message?.content ?? "";
  }
}
