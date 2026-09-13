import { LlmProvider } from "./types";
import { AnthropicProvider } from "./anthropicProvider";
import { OpenAiProvider } from "./openaiProvider";
import { DeepSeekProvider } from "./deepseekProvider";
import { OllamaProvider } from "./ollamaProvider";

let cachedDefault: LlmProvider | null = null;

import { decryptCredential } from "../crypto";

export function getLlmProviderForCreator(creator: {
  llmProvider?: string | null;
  llmApiKey?: string | null;
  llmModel?: string | null;
}): LlmProvider {
  const providerType = creator.llmProvider || process.env.LLM_PROVIDER || "deepseek";

  // Decifra l'API key se salvata cifrata at-rest nel DB
  const rawKeyFromDb = decryptCredential(creator.llmApiKey);

  // Se il provider è locale (Ollama / LM Studio), NON SERVE alcuna API key a pagamento!
  if (providerType === "ollama" || providerType === "local") {
    const host = rawKeyFromDb?.trim() || process.env.OLLAMA_HOST || "http://localhost:11434";
    const model = creator.llmModel?.trim() || process.env.OLLAMA_MODEL || "llama3.2";
    return new OllamaProvider(host, model);
  }

  const apiKey = rawKeyFromDb?.trim() || 
                 (providerType === "openai" ? process.env.OPENAI_API_KEY : 
                  providerType === "deepseek" ? process.env.DEEPSEEK_API_KEY : 
                  process.env.ANTHROPIC_API_KEY);

  if (!apiKey) {
    throw new Error(`Nessuna API Key trovata per il provider "${providerType}". Inseriscila nella scheda Creator o seleziona Ollama (Gratuito locale).`);
  }

  if (providerType === "deepseek") {
    return new DeepSeekProvider(apiKey, creator.llmModel || "deepseek-chat");
  } else if (providerType === "openai") {
    return new OpenAiProvider(apiKey, creator.llmModel || process.env.OPENAI_MODEL || "gpt-4o-mini");
  } else {
    return new AnthropicProvider(apiKey, creator.llmModel || process.env.ANTHROPIC_MODEL || "claude-sonnet-5");
  }
}

export function getLlmProvider(): LlmProvider {
  if (cachedDefault) return cachedDefault;
  cachedDefault = getLlmProviderForCreator({});
  return cachedDefault;
}

export * from "./types";
export * from "./deepseekProvider";

