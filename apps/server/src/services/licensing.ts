import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

/**
 * Licenza phone-home verso apps/license-server (gestito dall'ufficio che vende Nugis).
 * Attiva SOLO se sono configurate entrambe LICENSE_SERVER_URL e LICENSE_KEY nel .env:
 * un'installazione senza queste variabili (uso interno/di sviluppo, non venduta a un
 * cliente) non ha alcuna restrizione — la licenza è un vincolo commerciale, non una
 * funzione di sicurezza che deve essere sempre attiva.
 *
 * Grace period offline: se il server di licenze non è raggiungibile, l'installazione
 * resta valida per GRACE_PERIOD_MS dall'ultimo check riuscito (non si blocca al primo
 * problema di rete), ma non resta valida per sempre se il server sparisce — altrimenti
 * un cliente potrebbe staccare la connessione una volta convalidata e restare "licenziato"
 * a tempo indefinito.
 */
const GRACE_PERIOD_MS = 5 * 24 * 60 * 60 * 1000; // 5 giorni

function isLicensingConfigured(): boolean {
  return !!(process.env.LICENSE_SERVER_URL && process.env.LICENSE_KEY);
}

export async function getOrCreateInstanceId(): Promise<string> {
  const existing = await prisma.licenseState.findUnique({ where: { id: "singleton" } });
  if (existing) return existing.instanceId;

  const instanceId = crypto.randomUUID();
  await prisma.licenseState.create({ data: { id: "singleton", instanceId } });
  return instanceId;
}

export async function checkLicense(): Promise<void> {
  if (!isLicensingConfigured()) return; // nessuna restrizione se non configurata

  const instanceId = await getOrCreateInstanceId();
  const url = `${process.env.LICENSE_SERVER_URL!.replace(/\/$/, "")}/validate`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: process.env.LICENSE_KEY, instanceId }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as any;

    if (data.valid) {
      await prisma.licenseState.update({
        where: { id: "singleton" },
        data: {
          cachedStatus: "valid",
          cachedExpiresAt: new Date(data.expiresAt),
          cachedMaxCreators: data.maxCreators,
          cachedCustomerName: data.customerName,
          lastCheckAt: new Date(),
          lastValidAt: new Date(),
          lastError: null,
        },
      });
      logger.info(`[licensing] Licenza valida (cliente: ${data.customerName}, scade: ${data.expiresAt})`);
    } else {
      await prisma.licenseState.update({
        where: { id: "singleton" },
        data: { cachedStatus: "invalid", lastCheckAt: new Date(), lastError: data.message || data.reason },
      });
      logger.warn(`[licensing] Licenza NON valida: ${data.message || data.reason}`);
    }
  } catch (err: any) {
    // Server di licenze irraggiungibile: non tocchiamo cachedStatus/lastValidAt, solo
    // l'orario dell'ultimo tentativo e l'errore — la grace period si basa su lastValidAt.
    await prisma.licenseState
      .update({ where: { id: "singleton" }, data: { lastCheckAt: new Date(), lastError: `Server irraggiungibile: ${err?.message}` } })
      .catch(() => {});
    logger.warn(`[licensing] Impossibile contattare il server di licenze: ${err?.message}`);
  }
}

export interface LicenseUsability {
  usable: boolean;
  reason?: string;
}

export async function isLicenseUsable(): Promise<LicenseUsability> {
  if (!isLicensingConfigured()) return { usable: true };

  const state = await prisma.licenseState.findUnique({ where: { id: "singleton" } });
  if (!state || state.cachedStatus === "unchecked") {
    return { usable: false, reason: "Licenza non ancora verificata. Attendere il primo controllo o verificare la configurazione." };
  }
  if (state.cachedStatus === "invalid") {
    return { usable: false, reason: state.lastError || "Licenza non valida." };
  }
  if (state.cachedExpiresAt && state.cachedExpiresAt < new Date()) {
    return { usable: false, reason: "Licenza scaduta." };
  }
  if (!state.lastValidAt || Date.now() - state.lastValidAt.getTime() > GRACE_PERIOD_MS) {
    return { usable: false, reason: "Impossibile confermare la licenza da troppo tempo (server di licenze irraggiungibile oltre il periodo di tolleranza)." };
  }
  return { usable: true };
}

export async function getMaxCreators(): Promise<number> {
  if (!isLicensingConfigured()) return Infinity;
  const state = await prisma.licenseState.findUnique({ where: { id: "singleton" } });
  return state?.cachedMaxCreators ?? 0;
}

export async function getLicenseStatusForUi() {
  const configured = isLicensingConfigured();
  if (!configured) return { configured: false };

  const state = await prisma.licenseState.findUnique({ where: { id: "singleton" } });
  const usability = await isLicenseUsable();
  return {
    configured: true,
    usable: usability.usable,
    reason: usability.reason,
    customerName: state?.cachedCustomerName ?? null,
    expiresAt: state?.cachedExpiresAt ?? null,
    maxCreators: state?.cachedMaxCreators ?? null,
    lastCheckAt: state?.lastCheckAt ?? null,
  };
}
