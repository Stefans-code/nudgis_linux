import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";

export default function DashboardPage() {
  const [status, setStatus] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);

  async function load() {
    try {
      const [queueData, statsData, txData] = await Promise.all([
        apiFetch("/admin/dashboard/queue-status"),
        apiFetch("/admin/dashboard/stats"),
        apiFetch("/admin/dashboard/transactions"),
      ]);
      setStatus(queueData);
      setStats(statsData);
      setTransactions(txData);
    } catch (err) {
      console.error("Error loading dashboard data:", err);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  async function retry(id: string) {
    await apiFetch(`/admin/dashboard/queue/${id}/retry`, { method: "POST" });
    load();
  }

  if (!status || !stats) return null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Coda di Invio & System Metrics (Dati DB Reali)</h1>
          <p className="page-subtitle">
            Monitoraggio in tempo reale dei bot attivi, messaggi in coda, tentativi falliti e guadagni approvati.
          </p>
        </div>
      </div>

      {/* Metrics dal Database Reale */}
      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="stat-box">
          <div className="stat-value">{stats.activeBots} / {stats.totalCreators}</div>
          <div className="stat-label">Bot Attivi / Total Creator</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">{stats.totalFans}</div>
          <div className="stat-label">Total Fan Telegram Registrati</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">{stats.pendingClaims}</div>
          <div className="stat-label">Verifiche Pagamento in Attesa</div>
        </div>
      </div>

      {/* Incasso REALE (somma delle Transaction confermate a mano dall'admin, non una stima) */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 className="card-title">💰 Incasso Reale Registrato</h3>
        <p className="muted" style={{ marginBottom: 12 }}>
          Somma delle vendite confermate dall'admin (pagamenti esterni verificati con importo, contenuti/listino marcati venduti).
          Il bot non può rilevare da solo un pagamento reale fatto fuori piattaforma: questa cifra riflette solo quello che è stato confermato a mano.
        </p>
        <div className="stat-value" style={{ fontSize: 32, color: "#10b981" }}>{stats.totalEarningsFormatted}</div>
        <div className="stat-label">{stats.transactionCount} transazioni registrate</div>

        {transactions.length > 0 && (
          <table style={{ marginTop: 16 }}>
            <thead><tr><th>Descrizione</th><th>Fonte</th><th>Importo</th><th>Data</th></tr></thead>
            <tbody>
              {transactions.slice(0, 10).map((t) => (
                <tr key={t.id}>
                  <td>{t.description}</td>
                  <td><span className="tag">{t.source}</span></td>
                  <td><strong>{(t.amountCents / 100).toFixed(2)} {t.currency}</strong></td>
                  <td className="muted">{new Date(t.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Coda di Invio Messaggi */}
      <div className="card">
        <h3 className="card-title">Stato della Coda Outbound Queue</h3>
        <p className="muted" style={{ marginBottom: 16 }}>
          Monitoraggio anti-impallamento: visualizza messaggi in lavorazione, inviati e falliti.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, textAlign: "center" }}>
          <div className="stat-box">
            <div className="stat-value" style={{ color: "#eab308" }}>{status.pending}</div>
            <div className="stat-label">In attesa</div>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ color: "#3b82f6" }}>{status.processing}</div>
            <div className="stat-label">In elaborazione</div>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ color: "#ef4444" }}>{status.deadLetterCount}</div>
            <div className="stat-label">Dead Letter (Falliti)</div>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ color: "#22c55e" }}>{status.sentLast24h}</div>
            <div className="stat-label">Inviati nelle ultime 24h</div>
          </div>
        </div>
      </div>

      {/* Messaggi Falliti - Retry Manuale */}
      <div className="card">
        <h3 className="card-title">Dead Letter Messages (Messaggi Bloccati)</h3>
        {status.deadLetter.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Messaggio</th>
                <th>Errore Telegram</th>
                <th>Azione</th>
              </tr>
            </thead>
            <tbody>
              {status.deadLetter.map((item: any) => (
                <tr key={item.id}>
                  <td>{item.text.slice(0, 60)}</td>
                  <td className="muted">{item.lastError}</td>
                  <td>
                    <button className="secondary" style={{ padding: "4px 10px", fontSize: "12px" }} onClick={() => retry(item.id)}>
                      Riprova Invio
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted" style={{ textAlign: "center", padding: "20px" }}>
            Nessun messaggio bloccato in dead letter. Tutti i bot stanno inviando regolarmente.
          </p>
        )}
      </div>
    </div>
  );
}
