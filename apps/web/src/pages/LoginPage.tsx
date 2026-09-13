import { useState } from "react";
import { login } from "../api/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      window.location.href = "/creators";
    } catch {
      setError("Login fallito. Controlla email e password.");
    }
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
      <form onSubmit={handleSubmit} className="card" style={{ width: 320 }}>
        <h2>Nugis</h2>
        <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>Accedi al pannello</p>
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <button type="submit">Accedi</button>
      </form>
    </div>
  );
}
