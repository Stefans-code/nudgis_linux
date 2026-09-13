import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";

type Tab = "ai_settings" | "content" | "pricing" | "fans" | "followup" | "payments";

export default function CreatorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("ai_settings");
  const [creator, setCreator] = useState<any>(null);
  const [earnings, setEarnings] = useState<any>(null);
  const [followUpRule, setFollowUpRule] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    apiFetch("/admin/creators").then((list) => {
      const c = list.find((x: any) => x.id === id);
      if (c) setCreator(c);
    });
    apiFetch(`/admin/creators/${id}/earnings`).then(setEarnings).catch(() => {});
    apiFetch(`/admin/follow-up/creator/${id}`).then(setFollowUpRule).catch(() => {});
  }, [id]);

  if (!id) return null;

  const tabItems: { key: Tab; label: string }[] = [
    { key: "ai_settings", label: "Persona & AI Settings" },
    { key: "content", label: "Oggetti di Vendita" },
    { key: "pricing", label: "Listino Prezzi & Servizi" },
    { key: "fans", label: "Fan & Cartelle" },
    { key: "followup", label: "Follow-Up Automatico" },
    { key: "payments", label: "Verifica Pagamenti" },
  ];

  return (
    <div>
      {/* Top Header & Navigation */}
      <div style={{ marginBottom: "24px" }}>
        <button
          className="secondary"
          onClick={() => navigate("/creators")}
          style={{ marginBottom: "16px", padding: "8px 14px", fontSize: "13px" }}
        >
          ← Torna alla lista Creator
        </button>

        {/* Creator Info & Stat Header Bar (Slide 5 Brief) */}
        <div className="card" style={{ background: "rgba(22, 29, 45, 0.85)", padding: "24px", marginBottom: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: "16px",
                  background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "26px",
                  fontWeight: "bold",
                  color: "#fff",
                  boxShadow: "0 6px 20px rgba(99, 102, 241, 0.3)",
                }}
              >
                {creator?.name ? creator.name.charAt(0).toUpperCase() : "C"}
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h1 className="page-title" style={{ fontSize: "24px", margin: 0 }}>{creator?.name || "Dettaglio Creator"}</h1>
                  <span className={`tag ${creator?.isActive ? "status-active" : "status-inactive"}`}>
                    {creator?.isActive ? "BOT ATTIVO" : "BOT INATTIVO"}
                  </span>
                  <span className={`tag ${followUpRule?.quickReengagementEnabled ? "status-active" : "status-inactive"}`}>
                    {followUpRule?.quickReengagementEnabled ? "AUTO ENG ON" : "AUTO ENG OFF"}
                  </span>
                </div>
                <div className="muted" style={{ fontSize: "12px", marginTop: 4 }}>
                  ID Creator: <code style={{ color: "#818cf8" }}>{id}</code> | Bot Telegram Dedicato
                </div>
              </div>
            </div>

            {/* Quick Stat Indicators — dati reali (Transaction), non più hardcoded */}
            <div style={{ display: "flex", gap: 12 }}>
              <div className="stat-box" style={{ padding: "8px 16px", minWidth: 100 }}>
                <div className="stat-value" style={{ fontSize: "16px", color: "#10b981" }}>{earnings?.withdrawableFormatted ?? "€0.00"}</div>
                <div className="stat-label">Withdrawable</div>
              </div>
              <div className="stat-box" style={{ padding: "8px 16px", minWidth: 100 }}>
                <div className="stat-value" style={{ fontSize: "16px", color: "#f59e0b" }}>{earnings?.pendingFormatted ?? "€0.00"}</div>
                <div className="stat-label">Pending {creator?.withdrawalHoldDays ?? 21}d</div>
              </div>
              <div className="stat-box" style={{ padding: "8px 16px", minWidth: 100 }}>
                <div className="stat-value" style={{ fontSize: "16px", color: "#818cf8" }}>{earnings?.totalFormatted ?? "€0.00"}</div>
                <div className="stat-label">Total</div>
              </div>
              <div className="stat-box" style={{ padding: "8px 16px", minWidth: 100 }}>
                <div className="stat-value" style={{ fontSize: "16px", color: creator?.isActive ? "#22c55e" : "#ef4444" }}>{creator?.isActive ? "Attivo" : "Inattivo"}</div>
                <div className="stat-label">Status</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="tabs-nav">
        {tabItems.map((t) => (
          <button
            key={t.key}
            className={`tab-button ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === "ai_settings" && <AiSettingsTab creatorId={id} />}
      {tab === "content" && <ContentTab creatorId={id} />}
      {tab === "pricing" && <PricingTab creatorId={id} />}
      {tab === "fans" && <FansTab creatorId={id} />}
      {tab === "followup" && <FollowUpTab creatorId={id} />}
      {tab === "payments" && <PaymentClaimsTab creatorId={id} />}
    </div>
  );
}

// Tab combinata: Persona + AI Settings + Extra Instructions (Come richiesto nel brief slide 3 e 5)
function AiSettingsTab({ creatorId }: { creatorId: string }) {
  const navigate = useNavigate();
  const [persona, setPersona] = useState("");
  const [token, setToken] = useState("");
  const [llmProvider, setLlmProvider] = useState("ollama");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmModel, setLlmModel] = useState("llama3.2");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyMasked, setApiKeyMasked] = useState("");
  const [hasTelegramToken, setHasTelegramToken] = useState(false);
  const [telegramTokenMasked, setTelegramTokenMasked] = useState("");
  const [saved, setSaved] = useState(false);
  const [complianceAcknowledgedAt, setComplianceAcknowledgedAt] = useState<string | null>(null);
  const [ackChecked, setAckChecked] = useState(false);
  const [withdrawalHoldDays, setWithdrawalHoldDays] = useState(21);

  const [globalRules, setGlobalRules] = useState<any[]>([]);
  const [instructions, setInstructions] = useState<any[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  const [shortcuts, setShortcuts] = useState<any[]>([]);
  const [newShortcutCommand, setNewShortcutCommand] = useState("");
  const [newShortcutContent, setNewShortcutContent] = useState("");

  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftResult, setDraftResult] = useState<{ suggestedInstructions: string; suggestedShortcuts: any[]; pairsAnalyzed: number; pairsAvailable: number } | null>(null);

  function loadCreator() {
    apiFetch("/admin/creators").then((list) => {
      const c = list.find((x: any) => x.id === creatorId);
      if (c) {
        setPersona(c.personaPrompt ?? "");
        setLlmProvider(c.llmProvider ?? "ollama");
        setLlmModel(c.llmModel ?? "llama3.2");
        setHasApiKey(c.hasApiKey ?? false);
        setApiKeyMasked(c.apiKeyMasked ?? "");
        setHasTelegramToken(c.hasTelegramToken ?? false);
        setTelegramTokenMasked(c.telegramTokenMasked ?? "");
        setComplianceAcknowledgedAt(c.complianceAcknowledgedAt ?? null);
        setWithdrawalHoldDays(c.withdrawalHoldDays ?? 21);
      }
    });
  }

  useEffect(() => {
    loadCreator();
    apiFetch("/admin/global-rules").then(setGlobalRules).catch(() => {});
    loadInstructions();
    loadShortcuts();
  }, [creatorId]);

  async function loadShortcuts() {
    setShortcuts(await apiFetch(`/admin/shortcuts/creator/${creatorId}`));
  }

  async function addShortcut() {
    if (!newShortcutCommand.trim() || !newShortcutContent.trim()) return;
    await apiFetch(`/admin/shortcuts/creator/${creatorId}`, {
      method: "POST",
      body: JSON.stringify({ command: newShortcutCommand, content: newShortcutContent }),
    });
    setNewShortcutCommand("");
    setNewShortcutContent("");
    loadShortcuts();
  }

  async function removeShortcut(itemId: string) {
    await apiFetch(`/admin/shortcuts/${itemId}`, { method: "DELETE" });
    loadShortcuts();
  }

  async function generateDraft() {
    setDraftLoading(true);
    setDraftError(null);
    setDraftResult(null);
    try {
      const result = await apiFetch(`/admin/creators/${creatorId}/generate-instructions-from-chats`, { method: "POST" });
      setDraftResult(result);
    } catch (err: any) {
      setDraftError(err?.message ?? "Errore durante la generazione");
    } finally {
      setDraftLoading(false);
    }
  }

  async function applyDraftInstructions() {
    if (!draftResult?.suggestedInstructions) return;
    await apiFetch(`/admin/extra-instructions/creator/${creatorId}`, {
      method: "POST",
      body: JSON.stringify({ title: "Bozza da AI Training Draft", content: draftResult.suggestedInstructions, isStandard: false }),
    });
    loadInstructions();
  }

  async function applyDraftShortcuts() {
    if (!draftResult?.suggestedShortcuts?.length) return;
    for (const s of draftResult.suggestedShortcuts) {
      await apiFetch(`/admin/shortcuts/creator/${creatorId}`, {
        method: "POST",
        body: JSON.stringify({ command: s.command, content: s.content }),
      });
    }
    loadShortcuts();
  }

  async function acknowledgeCompliance() {
    if (!ackChecked) return;
    await apiFetch(`/admin/creators/${creatorId}/compliance-ack`, {
      method: "POST",
      body: JSON.stringify({ acknowledged: true }),
    });
    loadCreator();
  }

  const CLOUD_PROVIDER_WARNINGS: Record<string, string> = {
    anthropic:
      "Anthropic vieta esplicitamente nei suoi Termini d'Uso la generazione di contenuto sessualmente esplicito, anche via API — violazioni ripetute possono portare alla sospensione dell'account.",
    openai:
      "OpenAI vieta la generazione di erotica/contenuto sessualmente esplicito nei suoi Termini d'Uso (la \"modalità adulti\" annunciata è stata sospesa a marzo 2026).",
    deepseek:
      "DeepSeek vieta esplicitamente nei suoi Termini d'Uso i \"chatbot sessuali\" e contenuto pornografico/sessualmente esplicito.",
  };

  async function loadInstructions() {
    setInstructions(await apiFetch(`/admin/extra-instructions/creator/${creatorId}`));
  }

  async function savePersonaAndToken() {
    const body: any = {
      personaPrompt: persona,
      llmProvider,
      llmModel: llmModel.trim(),
      withdrawalHoldDays,
    };
    if (llmApiKey.trim()) body.llmApiKey = llmApiKey.trim();
    if (token.trim()) body.telegramBotToken = token.trim();

    await apiFetch(`/admin/creators/${creatorId}`, { method: "PATCH", body: JSON.stringify(body) });
    setSaved(true);
    setLlmApiKey("");
    setToken("");
    setTimeout(() => setSaved(false), 2000);
  }

  async function addInstruction() {
    if (!newTitle.trim() || !newContent.trim()) return;
    await apiFetch(`/admin/extra-instructions/creator/${creatorId}`, {
      method: "POST",
      body: JSON.stringify({ title: newTitle, content: newContent, isStandard: false }),
    });
    setNewTitle("");
    setNewContent("");
    loadInstructions();
  }

  async function toggleInstruction(item: any) {
    await apiFetch(`/admin/extra-instructions/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isEnabled: !item.isEnabled }),
    });
    loadInstructions();
  }

  async function removeInstruction(itemId: string) {
    await apiFetch(`/admin/extra-instructions/${itemId}`, { method: "DELETE" });
    loadInstructions();
  }

  return (
    <div className="grid-2">
      <div>
        {/* Credenziali API Provider LLM (Slide 5 Brief - Credenziali Sicure Mascherate) */}
        <div className="card" style={{ border: "1px solid var(--border-highlight)", marginBottom: 20 }}>
          <h3 className="card-title">Credentials & LLM Provider (Cifrate & Mascherate)</h3>
          <p className="muted">
            Configura la chiave API del modello LLM (es. <strong>DeepSeek API Key</strong> <code>sk-e70b7...</code>). Le chiavi sono salvate cifrate AES-256 e mai mostrate in chiaro.
          </p>

          <label>Provider LLM</label>
          <select value={llmProvider} onChange={(e) => setLlmProvider(e.target.value)}>
            <option value="ollama">Ollama Locale (CONSIGLIATO — gratuito, nessun ToS di terzi da rispettare)</option>
            <option value="deepseek">DeepSeek AI (cloud — ToS vieta contenuto sessuale esplicito)</option>
            <option value="anthropic">Anthropic Claude (cloud — ToS vieta contenuto sessuale esplicito)</option>
            <option value="openai">OpenAI ChatGPT (cloud — ToS vieta contenuto sessuale esplicito)</option>
          </select>

          <label>
            {llmProvider === "ollama" ? "Host Server Locale (Default: http://localhost:11434)" : "API Key"}
            {hasApiKey && <span className="tag status-active" style={{ marginLeft: 8 }}>IMPOSTATA: {apiKeyMasked}</span>}
          </label>
          <input
            type="password"
            placeholder={hasApiKey ? `Chiave già salvata (${apiKeyMasked}). Inserisci qui solo se vuoi cambiarla` : "Incolla API Key..."}
            value={llmApiKey}
            onChange={(e) => setLlmApiKey(e.target.value)}
          />

          <label>Modello LLM</label>
          <input
            placeholder={llmProvider === "ollama" ? "llama3.2, qwen2.5, mistral..." : "deepseek-chat, gpt-4o-mini, claude-3-5-sonnet..."}
            value={llmModel}
            onChange={(e) => setLlmModel(e.target.value)}
          />

          {CLOUD_PROVIDER_WARNINGS[llmProvider] && (
            <div style={{ background: "rgba(245, 158, 11, 0.12)", border: "1px solid rgba(245, 158, 11, 0.4)", borderRadius: "var(--radius-sm)", padding: 12, marginTop: 12, fontSize: 12 }}>
              ⚠️ <strong>Attenzione ToS provider:</strong> {CLOUD_PROVIDER_WARNINGS[llmProvider]} Usare questo provider per sexchat è a rischio e responsabilità di chi gestisce questa creator, non del software.
            </div>
          )}

          <h4 style={{ marginTop: 16, fontSize: "14px" }}>
            Token Bot Telegram (@BotFather)
            {hasTelegramToken && <span className="tag status-active" style={{ marginLeft: 8 }}>IMPOSTATO: {telegramTokenMasked}</span>}
          </h4>
          <input
            type="password"
            placeholder={hasTelegramToken ? `Token salvato (${telegramTokenMasked}). Inserisci qui solo se vuoi cambiarlo` : "Incolla token Telegram (es. 7094...:AAH...)"}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
            <button onClick={savePersonaAndToken}>Salva Credenziali & Model Settings</button>
            {saved && <span className="tag status-active">Salvato in modo sicuro</span>}
          </div>
        </div>

        {/* Attestazione responsabilità legale: il bot NON parte finché non è confermata
            (vedi bot/index.ts). Non è un controllo automatico sui contenuti — è un
            record verificabile di chi ha attivato cosa e quando. */}
        <div className="card" style={{ marginBottom: 20, border: complianceAcknowledgedAt ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(239,68,68,0.4)" }}>
          <h3 className="card-title">
            {complianceAcknowledgedAt ? "✅ Attestazione di Responsabilità Confermata" : "🔴 Attestazione di Responsabilità Richiesta — Bot Bloccato"}
          </h3>
          {complianceAcknowledgedAt ? (
            <p className="muted" style={{ fontSize: 12 }}>
              Confermata il {new Date(complianceAcknowledgedAt).toLocaleString()}. Cambiare provider LLM richiede una nuova conferma.
            </p>
          ) : (
            <>
              <p className="muted" style={{ fontSize: 13 }}>
                Il bot di questa creator <strong>non si avvia</strong> finché questa attestazione non viene confermata. Confermando dichiari, sotto la tua responsabilità:
              </p>
              <ul style={{ fontSize: 12, color: "var(--text-muted)", paddingLeft: 18, marginBottom: 12 }}>
                <li>di aver verificato l'età dei fan gestiti secondo le leggi applicabili;</li>
                <li>di essere a conoscenza dei Termini d'Uso del provider LLM selezionato (vedi avviso sopra se è un provider cloud) e di accettarne il rischio;</li>
                <li>di rispettare gli obblighi GDPR applicabili sui dati dei fan trattati (vedi docs/gdpr-data-handling.md).</li>
              </ul>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", fontSize: 12 }}>
                <input type="checkbox" style={{ width: "auto", marginTop: 2 }} checked={ackChecked} onChange={(e) => setAckChecked(e.target.checked)} />
                Confermo quanto sopra e mi assumo la responsabilità per questa creator.
              </label>
              <button style={{ marginTop: 10 }} disabled={!ackChecked} onClick={acknowledgeCompliance}>
                Conferma e Sblocca Bot
              </button>
            </>
          )}
        </div>

        <div className="card">
          <h3 className="card-title">Persona & Tono di Voce LLM</h3>
          <p className="muted">Descrizione del carattere, tono ed etnia che l'AI deve impersonare in chat.</p>
          <label>Prompt Principale Persona</label>
          <textarea
            rows={7}
            placeholder="Es. Eli, 18 anni, russa che vive in Trentino. Tono amichevole, provocante e persuasivo..."
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
          />
          <label>Giorni di attesa prima che l'incasso sia prelevabile ("Pending")</label>
          <input
            type="number"
            value={withdrawalHoldDays}
            onChange={(e) => setWithdrawalHoldDays(Number(e.target.value))}
          />
        </div>
      </div>

      <div>
        {/* Regole Standard Globali del Sistema (Dinamiche da DB) */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 className="card-title" style={{ margin: 0 }}>Regole Standard Globali</h3>
            <button className="secondary" style={{ fontSize: "12px", padding: "6px 12px" }} onClick={() => navigate("/global-rules")}>
              Gestisci nel Pannello Regole →
            </button>
          </div>
          <p className="muted" style={{ marginBottom: 12 }}>
            Regole universali attive per tutte le creator (salvate nel database):
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: "12px", color: "var(--text-muted)", lineHeight: "1.6" }}>
            {globalRules.filter((r) => r.isEnabled).map((rule) => (
              <li key={rule.id} style={{ marginBottom: 4 }}>
                <strong style={{ color: "#f8fafc" }}>{rule.title}:</strong> {rule.content}
              </li>
            ))}
          </ul>
        </div>

        {/* Istruzioni Custom Specifiche per questa Creator */}
        <div className="card">
          <h3 className="card-title">Istruzioni Custom Specifiche Creator</h3>
          <p className="muted">
            Regole extra dedicate unicamente a questo profilo (es. descrizioni per video specifici o storie personali).
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24, maxHeight: "250px", overflowY: "auto" }}>
            {instructions.map((item) => (
              <div
                key={item.id}
                style={{
                  background: "rgba(15, 19, 27, 0.6)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--radius-sm)",
                  padding: "12px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <strong style={{ fontSize: "14px" }}>{item.title}</strong>
                  <span className={`tag ${item.isEnabled ? "status-active" : "status-inactive"}`}>
                    {item.isEnabled ? "ATTIVO" : "DISATTIVATO"}
                  </span>
                </div>
                <p className="muted" style={{ margin: "4px 0 10px 0", fontSize: "12px", whiteSpace: "pre-wrap" }}>
                  {item.content}
                </p>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button className="secondary" style={{ padding: "4px 10px", fontSize: "12px" }} onClick={() => toggleInstruction(item)}>
                    {item.isEnabled ? "Disattiva" : "Attiva"}
                  </button>
                  <button className="danger" style={{ padding: "4px 10px", fontSize: "12px" }} onClick={() => removeInstruction(item.id)}>
                    Elimina
                  </button>
                </div>
              </div>
            ))}

            {instructions.length === 0 && (
              <p className="muted" style={{ textAlign: "center", fontSize: "12px", padding: 10 }}>Nessuna istruzione custom aggiuntiva per questa creator.</p>
            )}
          </div>

          <h4 style={{ fontSize: "14px", marginBottom: 8 }}>+ Aggiungi Istruzione Custom</h4>
          <input
            placeholder="Titolo istruzione (es. Video coppia centro commerciale)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <textarea
            placeholder="Testo dell'istruzione custom..."
            rows={3}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
          />
          <button onClick={addInstruction}>Salva Istruzione Custom</button>
        </div>

        {/* Shortcuts: comandi rapidi che il LLM può richiamare (es. "/listino") invece di
            riscrivere ogni volta un testo lungo — inviati senza ritardo di digitazione
            perché sono testo precompilato, non generato lì per lì. */}
        <div className="card" style={{ marginTop: 20 }}>
          <h3 className="card-title">⚡ Shortcuts</h3>
          <p className="muted">
            Comandi rapidi che il LLM può usare nei messaggi (es. <code>/listino</code>). Quando il LLM scrive lo shortcut,
            viene sostituito automaticamente dal testo completo e inviato come messaggio separato, senza tempo di digitazione.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {shortcuts.map((s) => (
              <div key={s.id} style={{ background: "rgba(15, 19, 27, 0.6)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <code style={{ color: "#818cf8" }}>{s.command}</code>
                  <button className="danger" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => removeShortcut(s.id)}>Elimina</button>
                </div>
                <p className="muted" style={{ fontSize: 12, margin: "6px 0 0 0", whiteSpace: "pre-wrap" }}>{s.content}</p>
              </div>
            ))}
            {shortcuts.length === 0 && <p className="muted" style={{ textAlign: "center", fontSize: 12, padding: 8 }}>Nessuno shortcut configurato.</p>}
          </div>
          <label>Comando (es. /listino)</label>
          <input placeholder="/listino" value={newShortcutCommand} onChange={(e) => setNewShortcutCommand(e.target.value)} />
          <label>Testo completo</label>
          <textarea rows={3} placeholder="Testo che sostituisce il comando..." value={newShortcutContent} onChange={(e) => setNewShortcutContent(e.target.value)} />
          <button onClick={addShortcut}>Salva Shortcut</button>
        </div>

        {/* AI Training Draft: analizza le chat reali già scambiate e propone una bozza
            di istruzioni + shortcut, da rivedere prima di salvare. */}
        <div className="card" style={{ marginTop: 20 }}>
          <h3 className="card-title">🧠 AI Training Draft</h3>
          <p className="muted">
            Genera extra instructions dettagliate e shortcuts usando fino a 900 coppie user/assistant delle chat reali.
            Il risultato è una BOZZA: controllala e applica solo quello che vuoi, non viene salvato in automatico.
          </p>
          <button onClick={generateDraft} disabled={draftLoading}>
            {draftLoading ? "Analisi in corso..." : "Generate extra instructions from real chats"}
          </button>
          {draftError && <p style={{ color: "var(--danger)", fontSize: 12 }}>{draftError}</p>}
          {draftResult && (
            <div style={{ marginTop: 16 }}>
              <p className="muted" style={{ fontSize: 12 }}>
                Analizzate {draftResult.pairsAnalyzed} coppie di messaggi (su {draftResult.pairsAvailable} disponibili).
              </p>
              {draftResult.suggestedInstructions ? (
                <>
                  <label>Istruzioni suggerite</label>
                  <textarea rows={6} readOnly value={draftResult.suggestedInstructions} style={{ fontSize: 12 }} />
                  <button className="secondary" onClick={applyDraftInstructions}>+ Aggiungi come Istruzione Custom</button>
                </>
              ) : (
                <p className="muted" style={{ fontSize: 12 }}>Nessuna chat sufficiente da analizzare per questa creator.</p>
              )}
              {draftResult.suggestedShortcuts?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <label>Shortcut suggeriti ({draftResult.suggestedShortcuts.length})</label>
                  {draftResult.suggestedShortcuts.map((s: any, i: number) => (
                    <div key={i} style={{ fontSize: 12, marginBottom: 4 }}>
                      <code style={{ color: "#818cf8" }}>{s.command}</code> — {s.content.slice(0, 60)}...
                    </div>
                  ))}
                  <button className="secondary" onClick={applyDraftShortcuts}>+ Aggiungi tutti gli Shortcut</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Tab Oggetti di Vendita / Contenuti Singoli (Slide 4 e 5)
function ContentTab({ creatorId }: { creatorId: string }) {
  const [grouped, setGrouped] = useState<Record<string, any[]>>({});
  const [fans, setFans] = useState<any[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [sellingItem, setSellingItem] = useState<string | null>(null);
  const [sellFanId, setSellFanId] = useState("");
  const [form, setForm] = useState({
    externalId: "",
    folder: "Sexchat #1",
    title: "",
    description: "",
    priceCents: 2000,
    mediaUrl: ""
  });

  async function load() {
    setGrouped(await apiFetch(`/admin/content-items/creator/${creatorId}`));
    setFans(await apiFetch(`/admin/fans/creator/${creatorId}`));
  }
  useEffect(() => { load(); }, [creatorId]);

  async function add() {
    if (!form.externalId || !form.title) return;
    await apiFetch(`/admin/content-items/creator/${creatorId}`, { method: "POST", body: JSON.stringify(form) });
    setForm({ externalId: "", folder: "Sexchat #1", title: "", description: "", priceCents: 2000, mediaUrl: "" });
    setShowAddForm(false);
    load();
  }

  async function removeItem(id: string) {
    await apiFetch(`/admin/content-items/${id}`, { method: "DELETE" });
    load();
  }

  async function markSold(itemId: string) {
    if (!sellFanId) return;
    await apiFetch(`/admin/content-items/${itemId}/mark-sold/${sellFanId}`, { method: "POST", body: JSON.stringify({}) });
    setSellingItem(null);
    setSellFanId("");
    load();
  }

  return (
    <div>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h3 className="card-title" style={{ margin: 0 }}>🛍️ Oggetti di Vendita Singoli & Media (Slide 5 Brief)</h3>
            <p className="muted" style={{ margin: "4px 0 0 0" }}>
              Organizzati per <strong>Cartelle</strong> (es. <em>Sexchat #1</em>, <em>Foto Live Piedi</em>, <em>Video Coppia</em>). L'AI richiama l'oggetto in chat tramite il suo <strong>ID Esterno</strong>.
            </p>
          </div>
          <button onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? "✕ Annulla" : "+ Nuovo Oggetto di Vendita"}
          </button>
        </div>

        {/* Modal / Form per Aggiungere Nuovo Contenuto */}
        {showAddForm && (
          <div style={{ background: "rgba(15, 19, 27, 0.8)", border: "1px solid var(--border-highlight)", padding: "20px", borderRadius: "var(--radius-md)", marginBottom: 24 }}>
            <h4 style={{ margin: "0 0 16px 0" }}>✨ Aggiungi Nuovo Contenuto Sbloccabile</h4>
            <div className="grid-2">
              <div>
                <label>ID Esterno (es. 21670210)</label>
                <input
                  placeholder="21670210"
                  value={form.externalId}
                  onChange={(e) => setForm({ ...form, externalId: e.target.value })}
                />
                <label>Cartella / Categoria</label>
                <input
                  placeholder="es. Sexchat #1, Foto Live, Video Coppia..."
                  value={form.folder}
                  onChange={(e) => setForm({ ...form, folder: e.target.value })}
                />
                <label>Titolo del Contenuto</label>
                <input
                  placeholder="es. Video di coppia supermercato / Foto piedi live..."
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div>
                <label>Prezzo in Centesimi (es. 2000 = 20,00 €)</label>
                <input
                  type="number"
                  value={form.priceCents}
                  onChange={(e) => setForm({ ...form, priceCents: Number(e.target.value) })}
                />
                <label>URL Media / Tribute Link (Opzionale)</label>
                <input
                  placeholder="https://t.me/tribute/app?startapp=..."
                  value={form.mediaUrl}
                  onChange={(e) => setForm({ ...form, mediaUrl: e.target.value })}
                />
                <label>Descrizione Contenuto per Prompt AI</label>
                <textarea
                  placeholder="Descrivi dettagliatamente cosa succede nel video o foto così l'AI lo racconterà al fan..."
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="secondary" onClick={() => setShowAddForm(false)}>Annulla</button>
              <button onClick={add}>Salva Oggetto di Vendita</button>
            </div>
          </div>
        )}

        {/* Visual Media Card Grid (Matching Slide 5 UI) */}
        {Object.entries(grouped).map(([folder, items]) => (
          <div key={folder} style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <span className="tag folder-badge" style={{ fontSize: "14px", padding: "6px 14px" }}>
                📁 Cartella: {folder}
              </span>
              <span className="muted" style={{ fontSize: "13px" }}>
                ({items.length} {items.length === 1 ? "contenuto" : "contenuti"})
              </span>
            </div>

            <div className="grid-3">
              {items.map((it) => (
                <div
                  key={it.id}
                  style={{
                    background: "rgba(15, 19, 27, 0.7)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius-md)",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {/* Media Thumbnail Box with Lock Icon */}
                  <div
                    style={{
                      height: 120,
                      background: "linear-gradient(135deg, #1e1b4b 0%, #311b92 100%)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                      borderBottom: "1px solid var(--border-color)",
                    }}
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.8" style={{ marginBottom: 6 }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    <span className="tag" style={{ background: "rgba(0,0,0,0.6)", fontSize: "11px" }}>
                      ID: #{it.externalId}
                    </span>
                    <div
                      style={{
                        position: "absolute",
                        top: 10,
                        right: 10,
                      }}
                    >
                      <span className="tag status-active" style={{ fontSize: "12px", fontWeight: "bold" }}>
                        {(it.priceCents / 100).toFixed(2)} €
                      </span>
                    </div>
                  </div>

                  {/* Card Content Body */}
                  <div style={{ padding: "16px", flex: 1, display: "flex", flexDirection: "column" }}>
                    <h4 style={{ margin: "0 0 6px 0", fontSize: "15px", color: "#fff" }}>{it.title}</h4>
                    <p className="muted" style={{ fontSize: "12px", flex: 1, margin: "0 0 12px 0", lineHeight: "1.4" }}>
                      {it.description || "Nessuna descrizione specificata."}
                    </p>

                    {/* Stats Pill: dati REALI dalle Transaction, non più hardcoded */}
                    <div style={{ display: "flex", justifyContent: "space-between", background: "rgba(0,0,0,0.3)", padding: "8px 12px", borderRadius: "6px", fontSize: "11px", marginBottom: 12 }}>
                      <span className="muted">Sblocchi: <strong style={{ color: "#fff" }}>{it.unlockCount ?? 0}</strong></span>
                      <span className="muted">Incassato: <strong style={{ color: "#10b981" }}>€{((it.earnedCents ?? 0) / 100).toFixed(2)}</strong></span>
                    </div>

                    {sellingItem === it.id && (
                      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                        <select value={sellFanId} onChange={(e) => setSellFanId(e.target.value)} style={{ flex: 1 }}>
                          <option value="">Scegli fan...</option>
                          {fans.map((f) => (
                            <option key={f.id} value={f.id}>{f.displayName ?? f.telegramChatId}</option>
                          ))}
                        </select>
                        <button style={{ padding: "4px 10px", fontSize: "12px" }} onClick={() => markSold(it.id)}>OK</button>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button
                        className="secondary"
                        style={{ padding: "4px 10px", fontSize: "12px" }}
                        onClick={() => setSellingItem(sellingItem === it.id ? null : it.id)}
                      >
                        Marca Venduto
                      </button>
                      <button className="danger" style={{ padding: "4px 10px", fontSize: "12px" }} onClick={() => removeItem(it.id)}>
                        Elimina
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {Object.keys(grouped).length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <p className="muted">Nessun oggetto di vendita inserito in questa scheda creator.</p>
            <button onClick={() => setShowAddForm(true)}>+ Crea Primo Oggetto di Vendita</button>
          </div>
        )}
      </div>
    </div>
  );
}

function PricingTab({ creatorId }: { creatorId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({ category: "videocall", label: "", priceCents: 3000 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ category: "", label: "", priceCents: 0 });

  async function load() {
    setItems(await apiFetch(`/admin/pricing-items/creator/${creatorId}`));
  }
  useEffect(() => { load(); }, [creatorId]);

  async function add() {
    if (!form.label) return;
    await apiFetch(`/admin/pricing-items/creator/${creatorId}`, { method: "POST", body: JSON.stringify(form) });
    setForm({ category: "videocall", label: "", priceCents: 3000 });
    load();
  }

  function startEdit(it: any) {
    setEditingId(it.id);
    setEditForm({ category: it.category, label: it.label, priceCents: it.priceCents });
  }

  async function saveEdit(id: string) {
    await apiFetch(`/admin/pricing-items/${id}`, { method: "PATCH", body: JSON.stringify(editForm) });
    setEditingId(null);
    load();
  }

  async function removeItem(id: string) {
    await apiFetch(`/admin/pricing-items/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="card">
      <h3 className="card-title">🏷️ Listino Prezzi Servizi & Videochiamate</h3>
      <p className="muted" style={{ marginBottom: 16 }}>
        Configura il listino prezzi per videochiamate live e video personalizzati che l'AI utilizzerà per proporre le offerte ai fan.
        Sono precompilati alla creazione della creator (valori di esempio) — modificali o cancellali liberamente qui sotto.
      </p>
      <table>
        <thead><tr><th>Categoria</th><th>Voce / Durata</th><th>Prezzo</th><th></th></tr></thead>
        <tbody>
          {items.map((it) => (
            editingId === it.id ? (
              <tr key={it.id}>
                <td>
                  <select value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}>
                    <option value="videocall">Videochiamata</option>
                    <option value="custom_video">Video Personalizzato</option>
                  </select>
                </td>
                <td><input value={editForm.label} onChange={(e) => setEditForm({ ...editForm, label: e.target.value })} /></td>
                <td><input type="number" value={editForm.priceCents} onChange={(e) => setEditForm({ ...editForm, priceCents: Number(e.target.value) })} /></td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => saveEdit(it.id)}>Salva</button>
                    <button className="secondary" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => setEditingId(null)}>Annulla</button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={it.id}>
                <td><span className="tag">{it.category === "videocall" ? "📹 Videochiamata" : "🎬 Video Personalizzato"}</span></td>
                <td><strong>{it.label}</strong></td>
                <td><span className="tag status-active">{(it.priceCents / 100).toFixed(2)} {it.currency}</span></td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="secondary" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => startEdit(it)}>Modifica</button>
                    <button className="danger" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => removeItem(it.id)}>Elimina</button>
                  </div>
                </td>
              </tr>
            )
          ))}
        </tbody>
      </table>

      <h4 style={{ marginTop: 24 }}>+ Aggiungi Nuova Voce Listino</h4>
      <div className="grid-2">
        <div>
          <label>Categoria Servizio</label>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="videocall">Videochiamata Live</option>
            <option value="custom_video">Video Personalizzato</option>
          </select>
          <label>Descrizione / Durata</label>
          <input
            placeholder="es. 5 minuti soft, 15 minuti completo"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
        </div>
        <div>
          <label>Prezzo in centesimi (es. 4000 = 40,00 €)</label>
          <input
            type="number"
            value={form.priceCents}
            onChange={(e) => setForm({ ...form, priceCents: Number(e.target.value) })}
          />
        </div>
      </div>
      <button onClick={add}>Salva Voce Listino</button>
    </div>
  );
}

function FansTab({ creatorId }: { creatorId: string }) {
  const [fans, setFans] = useState<any[]>([]);

  function load() {
    apiFetch(`/admin/fans/creator/${creatorId}`).then(setFans);
  }
  useEffect(() => { load(); }, [creatorId]);

  async function exportFanData(fan: any) {
    const data = await apiFetch(`/admin/fans/${fan.id}/gdpr-export`);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fan-${fan.id}-dati-personali.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function eraseFanData(fan: any) {
    if (!confirm(`Cancellare definitivamente i dati personali di "${fan.displayName ?? fan.telegramChatId}"? Messaggi e richieste di pagamento verranno eliminati (le transazioni contabili restano, senza collegamento al fan). Azione irreversibile.`)) return;
    await apiFetch(`/admin/fans/${fan.id}/gdpr-erase`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 className="card-title">👥 Fan & Cartelle Chat Telegram</h3>
        <p className="muted">
          Elenco utenti registrati in chat con il bot. Il tag cartella è gestito internamente nel nostro sistema per segmentare i clienti.
          Colonna GDPR: esporta o cancella i dati personali del fan (vedi docs/gdpr-data-handling.md).
        </p>
        <table>
          <thead>
            <tr>
              <th>Nome / Chat ID</th>
              <th>Tag Cartella</th>
              <th>Fase Sexchat</th>
              <th>Ultima Interazione</th>
              <th>Messaggi Inviati</th>
              <th>Follow-up</th>
              <th>GDPR</th>
            </tr>
          </thead>
          <tbody>
            {fans.map((f) => (
              <tr key={f.id}>
                <td><strong>{f.displayName ?? f.telegramChatId}</strong></td>
                <td><span className="tag folder-badge">{f.folderTag ?? "Generico"}</span></td>
                <td><span className="tag">{f.sexchatPhase ?? "-"}</span></td>
                <td>{f.lastMessageAt ? new Date(f.lastMessageAt).toLocaleString() : "-"}</td>
                <td>{f.maxMessagesUsed}</td>
                <td>{f.followUpOptOut ? <span className="tag status-inactive">Opt-out</span> : <span className="tag status-active">Attivo</span>}</td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="secondary" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => exportFanData(f)}>Esporta</button>
                    <button className="danger" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => eraseFanData(f)}>Cancella</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {fans.length === 0 && <p className="muted" style={{ textAlign: "center", padding: 20 }}>Nessun fan ancora registrato in chat per questo bot.</p>}
      </div>

      <TelegramFolderSection creatorId={creatorId} fans={fans} />
    </div>
  );
}

// Cartelle Telegram REALI via login MTProto one-time (brief pagina 1).
function TelegramFolderSection({ creatorId, fans }: { creatorId: string; fans: any[] }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loginStatus, setLoginStatus] = useState<string>("idle");
  const [folderTitle, setFolderTitle] = useState("Fan VIP");
  const [folderTag, setFolderTag] = useState("");
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  async function loadStatus() {
    const s = await apiFetch("/admin/telegram-auth/status");
    setConnected(s.connected);
  }
  useEffect(() => { loadStatus(); }, []);

  async function startLogin() {
    if (!phoneNumber.trim()) return;
    await apiFetch("/admin/telegram-auth/start", { method: "POST", body: JSON.stringify({ phoneNumber: phoneNumber.trim() }) });
    setLoginStatus("awaiting_code");
  }

  async function submitCode() {
    if (!code.trim()) return;
    await apiFetch("/admin/telegram-auth/code", { method: "POST", body: JSON.stringify({ phoneNumber: phoneNumber.trim(), code: code.trim() }) });
    // Dopo il codice può servire la password 2FA, oppure la sessione è già pronta: verifichiamo.
    setTimeout(async () => {
      const s = await apiFetch(`/admin/telegram-auth/status/${encodeURIComponent(phoneNumber.trim())}`);
      setLoginStatus(s.status);
      if (s.status === "connected") { setConnected(true); loadStatus(); }
    }, 1500);
  }

  async function submitPassword() {
    if (!password.trim()) return;
    await apiFetch("/admin/telegram-auth/password", { method: "POST", body: JSON.stringify({ phoneNumber: phoneNumber.trim(), password: password.trim() }) });
    setTimeout(async () => {
      const s = await apiFetch(`/admin/telegram-auth/status/${encodeURIComponent(phoneNumber.trim())}`);
      setLoginStatus(s.status);
      if (s.status === "connected") { setConnected(true); loadStatus(); }
    }, 1500);
  }

  async function disconnect() {
    await apiFetch("/admin/telegram-auth/disconnect", { method: "POST" });
    setConnected(false);
    setLoginStatus("idle");
  }

  async function createFolder() {
    setResultMsg(null);
    try {
      const res = await apiFetch(`/admin/fans/creator/${creatorId}/mtproto-folder`, {
        method: "POST",
        body: JSON.stringify({ folderTitle, folderId: 1, folderTag: folderTag || undefined }),
      });
      setResultMsg(`✅ Cartella "${folderTitle}" creata/aggiornata: ${res.includedCount} fan inclusi${res.skippedChatIds?.length ? `, ${res.skippedChatIds.length} saltati (chat non visibile all'account collegato)` : ""}.`);
    } catch (err: any) {
      setResultMsg(`❌ ${err?.message ?? "Errore durante la creazione della cartella"}`);
    }
  }

  return (
    <div className="card">
      <h3 className="card-title">📁 Cartelle Telegram Reali (MTProto)</h3>
      <p className="muted" style={{ marginBottom: 16 }}>
        Crea per davvero una cartella nell'app Telegram del tuo account (non solo il tag interno), inserendoci i fan.
        Richiede un login one-time con il tuo numero di telefono — il codice arriva via SMS/Telegram sul tuo telefono, non può essere automatizzato.
      </p>

      {connected === null && <p className="muted">Verifica stato connessione...</p>}

      {connected === true && (
        <div style={{ marginBottom: 20 }}>
          <span className="tag status-active" style={{ marginBottom: 12 }}>✅ Account Telegram collegato</span>
          <button className="secondary" style={{ marginLeft: 12, fontSize: 12, padding: "4px 10px" }} onClick={disconnect}>Scollega</button>

          <div className="grid-2" style={{ marginTop: 16 }}>
            <div>
              <label>Titolo Cartella</label>
              <input value={folderTitle} onChange={(e) => setFolderTitle(e.target.value)} />
            </div>
            <div>
              <label>Filtra solo fan con Tag Cartella (opzionale)</label>
              <input placeholder="es. VIP" value={folderTag} onChange={(e) => setFolderTag(e.target.value)} />
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: "8px 0" }}>{fans.length} fan totali per questo bot.</p>
          <button onClick={createFolder}>Crea/Aggiorna Cartella Reale su Telegram</button>
          {resultMsg && <p className="muted" style={{ marginTop: 10 }}>{resultMsg}</p>}
        </div>
      )}

      {connected === false && (
        <div>
          {loginStatus === "idle" && (
            <div className="grid-2">
              <div>
                <label>Numero di telefono (con prefisso, es. +391234567890)</label>
                <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+391234567890" />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button onClick={startLogin}>Invia Codice SMS</button>
              </div>
            </div>
          )}

          {loginStatus === "awaiting_code" && (
            <div className="grid-2">
              <div>
                <label>Codice ricevuto su Telegram/SMS</label>
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="12345" />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button onClick={submitCode}>Conferma Codice</button>
              </div>
            </div>
          )}

          {loginStatus === "awaiting_password" && (
            <div className="grid-2">
              <div>
                <label>Password Verifica in Due Passaggi (2FA)</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button onClick={submitPassword}>Conferma Password</button>
              </div>
            </div>
          )}

          {loginStatus === "failed" && <p className="muted">❌ Login fallito, riprova da capo con "Invia Codice SMS".</p>}
        </div>
      )}
    </div>
  );
}

function FollowUpTab({ creatorId }: { creatorId: string }) {
  const [rule, setRule] = useState<any>(null);

  async function load() {
    setRule(await apiFetch(`/admin/follow-up/creator/${creatorId}`));
  }
  useEffect(() => { load(); }, [creatorId]);

  async function save() {
    await apiFetch(`/admin/follow-up/creator/${creatorId}`, {
      method: "PATCH",
      body: JSON.stringify({
        isEnabled: rule.isEnabled,
        template: rule.template,
        templateVariant2: rule.templateVariant2 || undefined,
        templateVariant3: rule.templateVariant3 || undefined,
        minHoursSinceLastMessage: rule.minHoursSinceLastMessage,
        maxPerDay: rule.maxPerDay,
        quickReengagementEnabled: rule.quickReengagementEnabled,
        quickReengagementTemplate: rule.quickReengagementTemplate,
        quickReengagementMinMinutes: rule.quickReengagementMinMinutes,
        quickReengagementMaxMinutes: rule.quickReengagementMaxMinutes,
      }),
    });
    load();
  }

  if (!rule) return null;

  return (
    <div className="card">
      <h3 className="card-title">⏰ Follow-up Automatico Giornaliero</h3>
      <p className="muted">
        Ricontatta in automatico solo le chat attive dello <strong>stesso giorno</strong> (escludendo quelle del giorno prima per prevenire i ban Telegram come da brief slide 2).
      </p>
      <div style={{ margin: "16px 0" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            style={{ width: "auto", margin: 0 }}
            checked={rule.isEnabled}
            onChange={(e) => setRule({ ...rule, isEnabled: e.target.checked })}
          />
          <strong style={{ fontSize: "15px" }}>Abilita Follow-Up Automatico per questo Bot</strong>
        </label>
      </div>

      <label>Template Messaggio Follow-up (variante 1)</label>
      <textarea
        rows={2}
        value={rule.template}
        onChange={(e) => setRule({ ...rule, template: e.target.value })}
      />
      <label>Variante 2 (opzionale — ruotata a caso per non mandare testo identico a tutti)</label>
      <textarea
        rows={2}
        value={rule.templateVariant2 ?? ""}
        onChange={(e) => setRule({ ...rule, templateVariant2: e.target.value })}
      />
      <label>Variante 3 (opzionale)</label>
      <textarea
        rows={2}
        value={rule.templateVariant3 ?? ""}
        onChange={(e) => setRule({ ...rule, templateVariant3: e.target.value })}
      />

      <div className="grid-2" style={{ marginTop: 12 }}>
        <div>
          <label>Ore minime di inattività dalla risposta del fan (es. 3 ore)</label>
          <input
            type="number"
            value={rule.minHoursSinceLastMessage}
            onChange={(e) => setRule({ ...rule, minHoursSinceLastMessage: Number(e.target.value) })}
          />
        </div>
        <div>
          <label>Tetto massimo follow-up al giorno (anti-ban, vedi docs/telegram-automation-limits.md)</label>
          <input
            type="number"
            value={rule.maxPerDay}
            onChange={(e) => setRule({ ...rule, maxPerDay: Number(e.target.value) })}
          />
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: "8px 0" }}>
        I fan che scrivono "stop"/"non scrivermi più" vengono esclusi automaticamente dal follow-up (vedi colonna "Follow-up" nella tab Fan).
      </p>
      <button onClick={save}>Salva Impostazioni Follow-up</button>

      <hr style={{ margin: "24px 0", border: "none", borderTop: "1px solid var(--border-color)" }} />

      <h3 className="card-title">⚡ Nudge Rapido (separato dal follow-up giornaliero)</h3>
      <p className="muted">
        Più aggressivo del follow-up giornaliero sopra: ricontatta il fan pochi minuti dopo che il bot ha scritto per ultimo senza ricevere risposta.
        Va attivato con consapevolezza — vedi docs/telegram-automation-limits.md sui rischi di un contatto troppo frequente.
      </p>
      <div style={{ margin: "12px 0" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            style={{ width: "auto", margin: 0 }}
            checked={rule.quickReengagementEnabled ?? false}
            onChange={(e) => setRule({ ...rule, quickReengagementEnabled: e.target.checked })}
          />
          <strong style={{ fontSize: "14px" }}>Abilita Nudge Rapido</strong>
        </label>
      </div>
      <label>Messaggio nudge</label>
      <textarea
        rows={2}
        value={rule.quickReengagementTemplate ?? ""}
        onChange={(e) => setRule({ ...rule, quickReengagementTemplate: e.target.value })}
      />
      <div className="grid-2" style={{ marginTop: 12 }}>
        <div>
          <label>Minuti minimi di silenzio</label>
          <input
            type="number"
            value={rule.quickReengagementMinMinutes ?? 5}
            onChange={(e) => setRule({ ...rule, quickReengagementMinMinutes: Number(e.target.value) })}
          />
        </div>
        <div>
          <label>Minuti massimi di silenzio</label>
          <input
            type="number"
            value={rule.quickReengagementMaxMinutes ?? 10}
            onChange={(e) => setRule({ ...rule, quickReengagementMaxMinutes: Number(e.target.value) })}
          />
        </div>
      </div>
      <button onClick={save} style={{ marginTop: 12 }}>Salva Impostazioni Follow-up</button>
    </div>
  );
}

function PaymentClaimsTab({ creatorId }: { creatorId: string }) {
  const [claims, setClaims] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  async function load() {
    setClaims(await apiFetch(`/admin/payment-claims/creator/${creatorId}`));
  }
  useEffect(() => { load(); }, [creatorId]);

  async function resolve(claimId: string, status: "confirmed" | "not_found") {
    const replyToFan =
      drafts[claimId] ??
      (status === "confirmed"
        ? "Ho verificato: il tuo pagamento risulta confermato, grazie! 😊"
        : "Ho controllato ma non risulta nessun pagamento a nome tuo. Se pensi sia un errore scrivimi pure i dettagli così riverifico.");

    if (status === "confirmed") {
      const amountEuro = Number(amounts[claimId]);
      if (!amountEuro || amountEuro <= 0) {
        alert("Inserisci l'importo reale confermato (in €) prima di confermare: serve per registrare l'incasso vero in dashboard.");
        return;
      }
      await apiFetch(`/admin/payment-claims/${claimId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ status, replyToFan, amountCents: Math.round(amountEuro * 100) }),
      });
    } else {
      await apiFetch(`/admin/payment-claims/${claimId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ status, replyToFan }),
      });
    }
    load();
  }

  const pending = claims.filter((c) => c.status === "pending");
  const resolved = claims.filter((c) => c.status !== "pending");

  return (
    <div className="card">
      <h3 className="card-title">💳 Verifiche Pagamento Esterno</h3>
      <p className="muted">
        Quando un fan dichiara di aver pagato tramite un metodo esterno, il bot crea una richiesta qui. Risolvendo la richiesta, il fan riceverà il messaggio con l'esito reale su Telegram. Confermando un pagamento, l'importo inserito viene registrato come incasso reale in dashboard.
      </p>

      <h4 style={{ marginTop: 20 }}>Richieste da Verificare ({pending.length})</h4>
      {pending.map((c) => (
        <div key={c.id} style={{ background: "rgba(15, 19, 27, 0.6)", padding: "16px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <strong>{c.fan?.displayName ?? c.fan?.telegramChatId}</strong>
            <span className="muted" style={{ fontSize: "12px" }}>{new Date(c.createdAt).toLocaleString()}</span>
          </div>
          <p className="muted" style={{ background: "rgba(0,0,0,0.2)", padding: "10px", borderRadius: "6px" }}>"{c.fanMessage}"</p>
          <textarea
            rows={2}
            placeholder="Messaggio di risposta reale per il fan..."
            value={drafts[c.id] ?? ""}
            onChange={(e) => setDrafts({ ...drafts, [c.id]: e.target.value })}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="number"
              placeholder="Importo confermato (€)"
              style={{ maxWidth: 160 }}
              value={amounts[c.id] ?? ""}
              onChange={(e) => setAmounts({ ...amounts, [c.id]: e.target.value })}
            />
            <button onClick={() => resolve(c.id, "confirmed")}>Conferma Pagamento Found ✓</button>
            <button className="secondary" onClick={() => resolve(c.id, "not_found")}>Non Trovato ✕</button>
          </div>
        </div>
      ))}
      {pending.length === 0 && <p className="muted" style={{ padding: "10px 0" }}>Nessuna richiesta di pagamento in sospeso.</p>}

      <h4 style={{ marginTop: 24 }}>Richieste Risolte</h4>
      <table>
        <thead><tr><th>Fan</th><th>Esito</th><th>Data Risoluzione</th></tr></thead>
        <tbody>
          {resolved.map((c) => (
            <tr key={c.id}>
              <td><strong>{c.fan?.displayName ?? c.fan?.telegramChatId}</strong></td>
              <td><span className={`tag ${c.status === "confirmed" ? "status-active" : "status-inactive"}`}>{c.status === "confirmed" ? "Confermato" : "Non Trovato"}</span></td>
              <td>{c.resolvedAt ? new Date(c.resolvedAt).toLocaleString() : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

