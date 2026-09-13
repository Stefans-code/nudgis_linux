export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateReplyInput {
  creatorId?: string;
  personaPrompt: string;
  standardInstructions: string[];
  customInstructions: string[];
  history: ChatTurn[];
  incomingMessage: string;
}

export interface LlmProvider {
  generateReply(input: GenerateReplyInput): Promise<string>;

  /**
   * Completamento "grezzo": manda un prompt diretto senza passare dalla pipeline di
   * persona/istruzioni/sexchat/fast-path di generateReply. Usato per compiti "meta"
   * come l'AI Training Draft (services/aiTrainingDraft.ts), che deve ANALIZZARE
   * conversazioni passate e produrre testo strutturato, non impersonare la creator.
   */
  generateRaw(prompt: string): Promise<string>;
}
