import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";

/**
 * Gestione utenti/chatter del pannello — solo per gli "owner" (il backend rifiuta
 * comunque con 403 chiunque altro, questa pagina è protetta anche lato UI).
 * Un "chatter" vede/gestisce solo le creator che gli vengono assegnate qui.
 */
export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [creators, setCreators] = useState<any[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", role: "chatter" as "owner" | "chatter", creatorIds: [] as string[] });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [u, c] = await Promise.all([
        apiFetch("/admin/admin-users"),
        apiFetch("/admin/creators"),
      ]);
      setUsers(u);
      setCreators(c);
    } catch (err: any) {
      setError(err?.message ?? "Errore nel caricamento");
    }
  }
  useEffect(() => { load(); }, []);

  async function createUser() {
    setError(null);
    if (!form.email.trim() || !form.password.trim()) return;
    try {
      await apiFetch("/admin/admin-users", { method: "POST", body: JSON.stringify(form) });
      setForm({ email: "", password: "", role: "chatter", creatorIds: [] });
      setShowAddForm(false);
      load();
    } catch (err: any) {
      setError(err?.message ?? "Errore nella creazione");
    }
  }

  async function updateAccess(userId: string, creatorIds: string[]) {
    await apiFetch(`/admin/admin-users/${userId}`, { method: "PATCH", body: JSON.stringify({ creatorIds }) });
    load();
  }

  async function removeUser(userId: string) {
    try {
      await apiFetch(`/admin/admin-users/${userId}`, { method: "DELETE" });
      load();
    } catch (err: any) {
      setError(err?.message ?? "Errore nell'eliminazione");
    }
  }

  function toggleCreatorInForm(creatorId: string) {
    setForm((f) => ({
      ...f,
      creatorIds: f.creatorIds.includes(creatorId)
        ? f.creatorIds.filter((id) => id !== creatorId)
        : [...f.creatorIds, creatorId],
    }));
  }

  function toggleCreatorForUser(user: any, creatorId: string) {
    const current = user.creatorAccess.map((a: any) => a.creatorId);
    const next = current.includes(creatorId) ? current.filter((id: string) => id !== creatorId) : [...current, creatorId];
    updateAccess(user.id, next);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Utenti & Chatter</h1>
          <p className="page-subtitle">
            Owner: accesso completo a tutte le creator. Chatter: solo alle creator assegnate qui sotto —
            non vedono/toccano i dati (fan, incassi, istruzioni) delle creator di altri chatter.
          </p>
        </div>
        <button onClick={() => setShowAddForm(!showAddForm)}>{showAddForm ? "✕ Annulla" : "+ Nuovo Utente"}</button>
      </div>

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {showAddForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 className="card-title">Nuovo Utente</h3>
          <div className="grid-2">
            <div>
              <label>Email</label>
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <label>Password (minimo 8 caratteri)</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <label>Ruolo</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "owner" | "chatter" })}>
                <option value="chatter">Chatter (solo creator assegnate)</option>
                <option value="owner">Owner (accesso completo)</option>
              </select>
            </div>
            <div>
              {form.role === "chatter" && (
                <>
                  <label>Creator assegnate</label>
                  <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", padding: 10 }}>
                    {creators.map((c) => (
                      <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}>
                        <input type="checkbox" style={{ width: "auto" }} checked={form.creatorIds.includes(c.id)} onChange={() => toggleCreatorInForm(c.id)} />
                        {c.name}
                      </label>
                    ))}
                    {creators.length === 0 && <p className="muted">Nessuna creator ancora creata.</p>}
                  </div>
                </>
              )}
            </div>
          </div>
          <button style={{ marginTop: 12 }} onClick={createUser}>Crea Utente</button>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Ruolo</th>
              <th>Creator assegnate</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.email}</strong></td>
                <td><span className={`tag ${u.role === "owner" ? "status-active" : "folder-badge"}`}>{u.role}</span></td>
                <td>
                  {u.role === "owner" ? (
                    <span className="muted">Tutte (owner)</span>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {creators.map((c) => {
                        const assigned = u.creatorAccess.some((a: any) => a.creatorId === c.id);
                        return (
                          <span
                            key={c.id}
                            className={`tag ${assigned ? "status-active" : ""}`}
                            style={{ cursor: "pointer", opacity: assigned ? 1 : 0.4 }}
                            onClick={() => toggleCreatorForUser(u, c.id)}
                            title={assigned ? "Clicca per rimuovere" : "Clicca per assegnare"}
                          >
                            {c.name}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </td>
                <td>
                  <button className="danger" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => removeUser(u.id)}>
                    Elimina
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && <p className="muted" style={{ textAlign: "center", padding: 20 }}>Nessun utente.</p>}
      </div>
    </div>
  );
}
