import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";

interface GlobalRule {
  id: string;
  title: string;
  content: string;
  ruleType: string; // "number" | "select" | "toggle" | "text"
  paramValue: string;
  targetAudience: string; // "all" | "new_users" | "active_chatters" | "vip_users"
  unitLabel: string;
  isEnabled: boolean;
  sortOrder: number;
}

export default function GlobalRulesPage() {
  const [rules, setRules] = useState<GlobalRule[]>([]);
  const [search, setSearch] = useState("");
  const [filterAudience, setFilterAudience] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");

  const [showAdd, setShowAdd] = useState(false);
  const [editingRule, setEditingRule] = useState<GlobalRule | null>(null);

  // New Rule Form State
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [ruleType, setRuleType] = useState("number");
  const [paramValue, setParamValue] = useState("5");
  const [targetAudience, setTargetAudience] = useState("all");
  const [unitLabel, setUnitLabel] = useState("messaggi");
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      const data = await apiFetch("/admin/global-rules");
      setRules(data);
    } catch (err) {
      console.error("Error loading global rules:", err);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setLoading(true);
    try {
      await apiFetch("/admin/global-rules", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          ruleType,
          paramValue,
          targetAudience,
          unitLabel,
        }),
      });
      setTitle("");
      setContent("");
      setShowAdd(false);
      await load();
    } catch (err) {
      console.error("Error adding global rule:", err);
    } finally {
      setLoading(false);
    }
  }

  async function updateRule(ruleToUpdate: GlobalRule) {
    try {
      await apiFetch(`/admin/global-rules/${ruleToUpdate.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: ruleToUpdate.title,
          content: ruleToUpdate.content,
          ruleType: ruleToUpdate.ruleType,
          paramValue: ruleToUpdate.paramValue,
          targetAudience: ruleToUpdate.targetAudience,
          unitLabel: ruleToUpdate.unitLabel,
          isEnabled: ruleToUpdate.isEnabled,
        }),
      });
      load();
    } catch (err) {
      console.error("Error updating rule:", err);
    }
  }

  async function toggleRule(rule: GlobalRule) {
    await updateRule({ ...rule, isEnabled: !rule.isEnabled });
  }

  async function deleteRule(id: string) {
    await apiFetch(`/admin/global-rules/${id}`, { method: "DELETE" });
    load();
  }

  const filteredRules = rules.filter((r) => {
    const matchesSearch =
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.content.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "active" && r.isEnabled) ||
      (filterStatus === "inactive" && !r.isEnabled);
    const matchesAudience =
      filterAudience === "all" || r.targetAudience === filterAudience;
    return matchesSearch && matchesStatus && matchesAudience;
  });

  const getTargetBadgeLabel = (target: string) => {
    switch (target) {
      case "new_users":
        return "SOLO NUOVI FAN";
      case "active_chatters":
        return "FAN AD ALTO ENGAGEMENT";
      case "vip_users":
        return "CLIENTI VIP";
      default:
        return "TUTTI I FAN";
    }
  };

  return (
    <div>
      {/* Top Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Pannello Regole Standard Modulari</h1>
          <p className="page-subtitle">
            Imposta parametri numerici, strategie di vendita e filtri di target universali applicati automaticamente all'AI.
          </p>
        </div>
        <button onClick={() => { setShowAdd(!showAdd); setEditingRule(null); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          {showAdd ? "Chiudi Modulo" : "+ Nuova Regola Modulare"}
        </button>
      </div>

      {/* Form Aggiunta Regola Modulare */}
      {showAdd && (
        <div className="card" style={{ border: "1px solid #333", background: "#111" }}>
          <h3 className="card-title">Crea Nuova Regola Modulare / Parametrica</h3>
          <form onSubmit={addRule}>
            <div className="grid-2">
              <div>
                <label>Titolo Regola Modulare</label>
                <input
                  placeholder="Es. Soglia messaggi prima di vendita"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div>
                <label>Tipo di Controllo Modulare</label>
                <select value={ruleType} onChange={(e) => setRuleType(e.target.value)}>
                  <option value="number">Numero / Conteggio Parametrico</option>
                  <option value="select">Menu a Scelta Multipla</option>
                  <option value="toggle">Interruttore ON / OFF</option>
                  <option value="text">Testo Descrittivo</option>
                </select>
              </div>
            </div>

            <div className="grid-3">
              <div>
                <label>Valore del Parametro</label>
                <input
                  placeholder="Es. 5, 24, true..."
                  value={paramValue}
                  onChange={(e) => setParamValue(e.target.value)}
                />
              </div>
              <div>
                <label>Unità di Misura (Opzionale)</label>
                <input
                  placeholder="Es. messaggi, ore, €..."
                  value={unitLabel}
                  onChange={(e) => setUnitLabel(e.target.value)}
                />
              </div>
              <div>
                <label>Filtro Target Fan Applicabile</label>
                <select value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)}>
                  <option value="all">Tutti i Fan (Universale)</option>
                  <option value="new_users">Solo Nuovi Fan</option>
                  <option value="active_chatters">Fan ad Alto Engagement</option>
                  <option value="vip_users">Clienti VIP</option>
                </select>
              </div>
            </div>

            <label>Testo Regola per il Prompt LLM (Usa &#123;paramValue&#125; per inserire il parametro numerico)</label>
            <textarea
              rows={3}
              placeholder="Es. Manda almeno {paramValue} messaggi di conversazione prima di proporre contenuti..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
            />

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="secondary" onClick={() => setShowAdd(false)}>
                Annulla
              </button>
              <button type="submit" disabled={loading}>
                {loading ? "Salvataggio..." : "Salva Regola Modulare"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modale Modifica Regola */}
      {editingRule && (
        <div className="card" style={{ border: "1px solid #444", background: "#141414" }}>
          <h3 className="card-title">Modifica Regola #{editingRule.id.substring(0, 6)}</h3>
          <form onSubmit={(e) => { e.preventDefault(); updateRule(editingRule); setEditingRule(null); }}>
            <label>Titolo Regola</label>
            <input
              value={editingRule.title}
              onChange={(e) => setEditingRule({ ...editingRule, title: e.target.value })}
              required
            />

            <div className="grid-3">
              <div>
                <label>Valore Parametro</label>
                <input
                  value={editingRule.paramValue}
                  onChange={(e) => setEditingRule({ ...editingRule, paramValue: e.target.value })}
                />
              </div>
              <div>
                <label>Unità di Misura</label>
                <input
                  value={editingRule.unitLabel}
                  onChange={(e) => setEditingRule({ ...editingRule, unitLabel: e.target.value })}
                />
              </div>
              <div>
                <label>Target Fan</label>
                <select
                  value={editingRule.targetAudience}
                  onChange={(e) => setEditingRule({ ...editingRule, targetAudience: e.target.value })}
                >
                  <option value="all">Tutti i Fan (Universale)</option>
                  <option value="new_users">Solo Nuovi Fan</option>
                  <option value="active_chatters">Fan ad Alto Engagement</option>
                  <option value="vip_users">Clienti VIP</option>
                </select>
              </div>
            </div>

            <label>Testo Prompt LLM</label>
            <textarea
              rows={3}
              value={editingRule.content}
              onChange={(e) => setEditingRule({ ...editingRule, content: e.target.value })}
              required
            />

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="secondary" onClick={() => setEditingRule(null)}>
                Annulla
              </button>
              <button type="submit">Salva Modifiche</button>
            </div>
          </form>
        </div>
      )}

      {/* Row Filtri e Ricerca */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* Status Filter */}
          <button
            className={filterStatus === "all" ? "" : "secondary"}
            onClick={() => setFilterStatus("all")}
            style={{ fontSize: "12px", padding: "6px 12px" }}
          >
            Stato: Tutti ({rules.length})
          </button>
          <button
            className={filterStatus === "active" ? "" : "secondary"}
            onClick={() => setFilterStatus("active")}
            style={{ fontSize: "12px", padding: "6px 12px" }}
          >
            Attivi
          </button>

          {/* Target Audience Selector Filter */}
          <select
            value={filterAudience}
            onChange={(e) => setFilterAudience(e.target.value)}
            style={{ maxWidth: "200px", marginBottom: 0, padding: "5px 10px", fontSize: "12px" }}
          >
            <option value="all">Filtro Target: Tutti i Fan</option>
            <option value="new_users">Filtro Target: Nuovi Fan</option>
            <option value="active_chatters">Filtro Target: Fan Attivi</option>
            <option value="vip_users">Filtro Target: Fan VIP</option>
          </select>
        </div>

        <input
          placeholder="Cerca regole o parametri..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: "300px", marginBottom: 0 }}
        />
      </div>

      {/* Lista Cards Regole Modulari */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {filteredRules.map((r) => (
          <div key={r.id} className="card" style={{ margin: 0, padding: 20, border: "1px solid #222" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <strong style={{ fontSize: "16px", color: "#ffffff" }}>{r.title}</strong>
                <span className={`tag ${r.isEnabled ? "status-active" : "status-inactive"}`}>
                  {r.isEnabled ? "ATTIVA" : "DISATTIVATA"}
                </span>
                <span className="tag" style={{ background: "#1a1a1a", border: "1px solid #333", color: "#cccccc" }}>
                  {getTargetBadgeLabel(r.targetAudience)}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button className="secondary" style={{ padding: "5px 12px", fontSize: "12px" }} onClick={() => setEditingRule(r)}>
                  Modifica
                </button>
                <button className="secondary" style={{ padding: "5px 12px", fontSize: "12px" }} onClick={() => toggleRule(r)}>
                  {r.isEnabled ? "Disattiva" : "Attiva"}
                </button>
                <button className="danger" style={{ padding: "5px 12px", fontSize: "12px" }} onClick={() => deleteRule(r.id)}>
                  Elimina
                </button>
              </div>
            </div>

            {/* Modulo di Controllo Dinamico Parametrico (Input Numerici / Selettori / Toggle) */}
            <div style={{ background: "#111111", border: "1px solid #222", padding: "14px", borderRadius: "6px", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <span style={{ fontSize: "11px", color: "#888888", textTransform: "uppercase", fontWeight: 600 }}>
                    Impostazione Parametrica Modulare:
                  </span>
                  <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 10 }}>
                    {r.ruleType === "number" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="number"
                          value={r.paramValue}
                          onChange={(e) => {
                            const updated = { ...r, paramValue: e.target.value };
                            setRules(rules.map((x) => (x.id === r.id ? updated : x)));
                          }}
                          onBlur={() => updateRule(r)}
                          style={{ width: "90px", marginBottom: 0, padding: "5px 8px", fontSize: "14px", fontWeight: 700, textAlign: "center" }}
                        />
                        <strong style={{ fontSize: "13px", color: "#ffffff" }}>{r.unitLabel}</strong>
                      </div>
                    )}

                    {r.ruleType === "select" && (
                      <select
                        value={r.paramValue}
                        onChange={(e) => {
                          const updated = { ...r, paramValue: e.target.value };
                          setRules(rules.map((x) => (x.id === r.id ? updated : x)));
                          updateRule(updated);
                        }}
                        style={{ marginBottom: 0, padding: "6px 10px", fontSize: "13px", maxWidth: "260px" }}
                      >
                        <option value="lengthen_chat">Allunga conversazione & empatia</option>
                        <option value="direct_selling">Vendita diretta contenuti</option>
                        <option value="tribute_and_stars">Solo Link Tribute o Telegram Stars</option>
                      </select>
                    )}

                    {r.ruleType === "toggle" && (
                      <button
                        className={r.paramValue === "true" ? "" : "secondary"}
                        onClick={() => {
                          const newVal = r.paramValue === "true" ? "false" : "true";
                          const updated = { ...r, paramValue: newVal };
                          setRules(rules.map((x) => (x.id === r.id ? updated : x)));
                          updateRule(updated);
                        }}
                        style={{ fontSize: "12px", padding: "5px 14px" }}
                      >
                        {r.paramValue === "true" ? "ABILITATO (ON)" : "DISABILITATO (OFF)"}
                      </button>
                    )}

                    {r.ruleType === "text" && (
                      <span style={{ fontSize: "13px", color: "#ffffff", fontWeight: 500 }}>Standard Testuale</span>
                    )}
                  </div>
                </div>

                <span className="muted" style={{ fontSize: "12px" }}>
                  Uso nel Prompt: <code>{r.content.replace(/{paramValue}/g, r.paramValue || "...")}</code>
                </span>
              </div>
            </div>
          </div>
        ))}

        {filteredRules.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: "40px" }}>
            <p className="muted">Nessuna regola modulare trovata con i filtri selezionati.</p>
          </div>
        )}
      </div>
    </div>
  );
}
