import { prisma } from "../../lib/prisma";

interface CachedGlobalRules {
  timestamp: number;
  rules: string[];
}

let cachedRules: CachedGlobalRules | null = null;
const CACHE_TTL_MS = 60 * 1000; // 1 minuto di cache in memoria per evitare query DB ripetute

/**
 * Carica le regole globali attive in memoria RAM con Caching TTL a 0ms overhead.
 */
export async function getCachedGlobalRuleStrings(): Promise<string[]> {
  const now = Date.now();
  if (cachedRules && now - cachedRules.timestamp < CACHE_TTL_MS) {
    return cachedRules.rules;
  }

  const dbGlobalRules = await prisma.globalRule.findMany({
    where: { isEnabled: true },
    orderBy: { sortOrder: "asc" },
  });

  const ruleStrings = dbGlobalRules.map((r) => {
    let formatted = r.content;
    if (r.paramValue) {
      formatted = formatted.replace(/{paramValue}/g, r.paramValue);
    }
    if (r.targetAudience && r.targetAudience !== "all") {
      formatted += ` (Target: ${r.targetAudience})`;
    }
    return formatted;
  });

  cachedRules = {
    timestamp: now,
    rules: ruleStrings,
  };

  return ruleStrings;
}

/**
 * Invalida la cache quando le regole vengono modificate dal pannello admin.
 */
export function invalidateGlobalRulesCache() {
  cachedRules = null;
}
