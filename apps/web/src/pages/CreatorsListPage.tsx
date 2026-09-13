import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";

interface Creator {
  id: string;
  name: string;
  isActive: boolean;
  personaPrompt: string;
  hasTelegramToken?: boolean;
  earningsFormatted?: string;
}

export default function CreatorsListPage() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function load() {
    try {
      const data: Creator[] = await apiFetch("/admin/creators");
      setCreators(data); // mostra subito la lista, gli incassi arrivano un attimo dopo
      const withEarnings = await Promise.all(
        data.map(async (c) => {
          try {
            const e = await apiFetch(`/admin/creators/${c.id}/earnings`);
            return { ...c, earningsFormatted: e.totalFormatted };
          } catch {
            return c; // un chatter potrebbe non avere accesso a una creator nell'elenco: non blocca la card
          }
        })
      );
      setCreators(withEarnings);
    } catch (err) {
      console.error("Error loading creators:", err);
    }
  }

  useEffect(() => { load(); }, []);

  async function createCreator(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const newCreator = await apiFetch("/admin/creators", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), personaPrompt: persona.trim() })
      });
      setName("");
      setPersona("");
      setShowAddForm(false);
      await load();
      if (newCreator?.id) {
        navigate(`/creators/${newCreator.id}`);
      }
    } catch (err) {
      console.error("Error creating creator:", err);
    } finally {
      setLoading(false);
    }
  }

  const filteredCreators = creators.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Top Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Creators & Bots</h1>
          <p className="page-subtitle">
            Gestione profili Creator, bot Telegram dedicati, istruzioni ed oggetti di vendita sbloccabili.
          </p>
        </div>
        <button onClick={() => setShowAddForm(!showAddForm)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          {showAddForm ? "Chiudi Modulo" : "Inserisci Nuova Creator"}
        </button>
      </div>

      {/* Inline Add Creator Form (Requested in Brief Slide 3) */}
      {showAddForm && (
        <div className="card" style={{ border: "1px solid var(--border-highlight)", background: "rgba(22, 29, 45, 0.9)" }}>
          <h3 className="card-title">Aggiungi Nuova Creator da Admin</h3>
          <p className="muted" style={{ marginBottom: "16px" }}>
            Crea la scheda profilo. Successivamente potrai associare il Token Bot Telegram, impostare l'AI e i contenuti di vendita.
          </p>
          <form onSubmit={createCreator}>
            <div className="grid-2">
              <div>
                <label>Nome Creator / Modella</label>
                <input
                  placeholder="Es. Eli, Jessica, Sofia..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label>Persona / Tono di Voce LLM</label>
                <input
                  placeholder="Es. Modella 22enne russa residente in Trentino..."
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
              <button type="button" className="secondary" onClick={() => setShowAddForm(false)}>
                Annulla
              </button>
              <button type="submit" disabled={loading}>
                {loading ? "Creazione in corso..." : "Salva e Apri Scheda Creator →"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div style={{ marginBottom: 24, display: "flex", gap: 16, alignItems: "center" }}>
        <input
          placeholder="Cerca creator per nome o ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: "380px", marginBottom: 0 }}
        />
        <span className="muted" style={{ fontSize: "13px" }}>
          {filteredCreators.length} Creator trovate
        </span>
      </div>

      {/* Creator Cards Grid (Matching Slide 3 Design) */}
      <div className="grid-3">
        {filteredCreators.map((c) => (
          <div key={c.id} className="creator-card">
            {/* Card Top / Avatar + Name + Status */}
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "12px",
                  background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "22px",
                  fontWeight: "bold",
                  color: "#fff",
                  boxShadow: "0 4px 12px rgba(99, 102, 241, 0.25)",
                }}
              >
                {c.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 className="creator-name" style={{ fontSize: "18px", margin: 0 }}>{c.name}</h3>
                  <span className={`tag ${c.isActive ? "status-active" : "status-inactive"}`}>
                    {c.isActive ? "● AI ON" : "○ INATTIVO"}
                  </span>
                </div>
                <div className="muted" style={{ fontSize: "11px", marginTop: 4 }}>
                  ID: <code style={{ color: "#818cf8" }}>{c.id.substring(0, 10)}</code>
                </div>
              </div>
            </div>

            {/* Persona Summary */}
            <p className="muted" style={{ flex: 1, minHeight: "42px", fontSize: "13px", margin: "0 0 16px 0" }}>
              {c.personaPrompt ? (
                c.personaPrompt.length > 85 ? c.personaPrompt.substring(0, 85) + "..." : c.personaPrompt
              ) : (
                <em style={{ color: "var(--text-dim)" }}>Nessun prompt persona impostato.</em>
              )}
            </p>

            {/* Stats Row — dati reali, non più hardcoded */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              <div className="stat-box" style={{ padding: "10px" }}>
                <div className="stat-value" style={{ fontSize: "16px", color: "#10b981" }}>{c.earningsFormatted ?? "…"}</div>
                <div className="stat-label" style={{ fontSize: "10px" }}>Incassato</div>
              </div>
              <div className="stat-box" style={{ padding: "10px" }}>
                <div className="stat-value" style={{ fontSize: "16px", color: c.hasTelegramToken ? "#818cf8" : "#ef4444" }}>
                  {c.hasTelegramToken ? "Configurato" : "Non configurato"}
                </div>
                <div className="stat-label" style={{ fontSize: "10px" }}>Bot Telegram</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ paddingTop: 12, borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => navigate(`/creators/${c.id}`)} style={{ width: "100%" }}>
                Apri Scheda Creator & AI Settings →
              </button>
            </div>
          </div>
        ))}

        {filteredCreators.length === 0 && (
          <div className="card" style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px 20px" }}>
            <p className="muted">Nessuna creator trovata.</p>
          </div>
        )}
      </div>
    </div>
  );
}


