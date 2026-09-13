import { prisma } from "../lib/prisma";

/**
 * Revoca/verifica token JWT persistita su DB (prima era un Set in-memoria: si perdeva
 * ad ogni riavvio del server e non funzionava con più istanze/repliche dietro un load
 * balancer, dove il logout su un'istanza non veniva visto dalle altre).
 */
export async function revokeToken(token: string): Promise<void> {
  await prisma.revokedToken.upsert({
    where: { token },
    update: {},
    create: { token },
  });
}

export async function isTokenRevoked(token: string): Promise<boolean> {
  const row = await prisma.revokedToken.findUnique({ where: { token } });
  return !!row;
}
