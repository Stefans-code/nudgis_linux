import { GenerateReplyInput, LlmProvider } from "./types";
import { buildSystemPromptAsync, wrapUserMessage } from "./promptBuilder";
import { checkFastPathMatch } from "./fastPath";

/**
 * Provider LLM Locale (Ollama / LM Studio / Local vLLM) - 100% GRATUITO E ZERO COSTI API.
 * Esegue modelli locali scaricati (es. Llama 3.2, Qwen 2.5, Mistral 7b, Gemma 2).
 * Non richiede carte di credito o chiavi a pagamento.
 */
export class OllamaProvider implements LlmProvider {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl: string = "http://localhost:11434", model: string = "llama3.2") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
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

    // Endpoint compatibile sia con Ollama native (/api/chat) che con OpenAI endpoint (/v1/chat/completions)
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!res.ok) {
      // Fallback a endpoint nativo Ollama /api/chat
      const fallbackRes = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: false,
        }),
      });

      if (!fallbackRes.ok) {
        throw new Error(`Local LLM (Ollama) non raggiungibile su ${this.baseUrl}. Assicurati che Ollama o LM Studio sia avviato in locale.`);
      }

      const fallbackData = (await fallbackRes.json()) as any;
      return fallbackData.message?.content ?? "";
    }

    const data = (await res.json()) as any;
    return data.choices?.[0]?.message?.content ?? "";
  }

  async generateRaw(prompt: string): Promise<string> {
    const messages = [{ role: "user", content: prompt }];
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, messages, temperature: 0.3, max_tokens: 2000 }),
    });

    if (!res.ok) {
      const fallbackRes = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, messages, stream: false }),
      });
      if (!fallbackRes.ok) {
        throw new Error(`Local LLM (Ollama) non raggiungibile su ${this.baseUrl}.`);
      }
      const fallbackData = (await fallbackRes.json()) as any;
      return fallbackData.message?.content ?? "";
    }

    const data = (await res.json()) as any;
    return data.choices?.[0]?.message?.content ?? "";
  }
}
