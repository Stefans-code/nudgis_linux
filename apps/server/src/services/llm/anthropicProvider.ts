import Anthropic from "@anthropic-ai/sdk";
import { GenerateReplyInput, LlmProvider } from "./types";
import { buildSystemPromptAsync, wrapUserMessage } from "./promptBuilder";
import { checkFastPathMatch } from "./fastPath";

/**
 * Provider Anthropic Claude con ottimizzazioni Fast-Path (<5ms), RAM Prompt Cache, Content Matcher e History Truncation.
 */
export class AnthropicProvider implements LlmProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
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

    const messages: Anthropic.MessageParam[] = [
      ...compressedHistory.map((turn) => ({
        role: turn.role,
        content: turn.role === "user" ? wrapUserMessage(turn.content) : turn.content,
      })),
      { role: "user" as const, content: wrapUserMessage(input.incomingMessage) },
    ];

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 500,
      system,
      messages,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock && "text" in textBlock ? textBlock.text : "";
  }

  async generateRaw(prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock && "text" in textBlock ? textBlock.text : "";
  }
}
