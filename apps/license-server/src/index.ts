import "dotenv/config";
import express from "express";
import cors from "cors";
import { licensesAdminRouter, licenseValidateRouter } from "./routes/licenses";

if (!process.env.LICENSE_ADMIN_SECRET || process.env.LICENSE_ADMIN_SECRET.length < 16) {
  console.error("FATAL: LICENSE_ADMIN_SECRET mancante o troppo corto (minimo 16 caratteri). Impostalo nel .env.");
  process.exit(1);
}

const app = express();

app.use(cors()); // /validate deve poter essere chiamato da qualunque installazione cliente, ovunque sia ospitata
app.use(express.json({ limit: "200kb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/admin/licenses", licensesAdminRouter);
app.use("/validate", licenseValidateRouter);

const port = Number(process.env.PORT ?? 5000);
app.listen(port, () => {
  console.log(`[license-server] In ascolto su http://localhost:${port}`);
});
