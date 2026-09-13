import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/prisma";
import { hasCreatorAccess } from "../creatorAccess";

/**
 * Test di integrazione (DB reale) per il controllo di accesso multi-operatore:
 * un owner deve vedere sempre tutto, un chatter SOLO le creator assegnate — è la
 * logica che impedisce a un chatter di un cliente di vedere/toccare i dati (fan,
 * incassi, istruzioni) di un altro cliente gestito da un altro chatter.
 */
async function createOwner() {
  return prisma.adminUser.create({
    data: { email: `owner-${Date.now()}-${Math.random()}@test.local`, passwordHash: "x", role: "owner" },
  });
}

async function createChatter() {
  return prisma.adminUser.create({
    data: { email: `chatter-${Date.now()}-${Math.random()}@test.local`, passwordHash: "x", role: "chatter" },
  });
}

async function createCreator() {
  return prisma.creator.create({ data: { name: `Creator ${Date.now()}-${Math.random()}` } });
}

describe("hasCreatorAccess (integrazione, DB reale)", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("un owner ha sempre accesso, anche senza nessuna assegnazione esplicita", async () => {
    const owner = await createOwner();
    const creator = await createCreator();

    const access = await hasCreatorAccess(owner.id, "owner", creator.id);
    expect(access).toBe(true);
  });

  it("un chatter SENZA assegnazione non ha accesso", async () => {
    const chatter = await createChatter();
    const creator = await createCreator();

    const access = await hasCreatorAccess(chatter.id, "chatter", creator.id);
    expect(access).toBe(false);
  });

  it("un chatter CON assegnazione ha accesso solo a quella creator, non alle altre", async () => {
    const chatter = await createChatter();
    const assignedCreator = await createCreator();
    const otherCreator = await createCreator();

    await prisma.adminCreatorAccess.create({
      data: { adminUserId: chatter.id, creatorId: assignedCreator.id },
    });

    expect(await hasCreatorAccess(chatter.id, "chatter", assignedCreator.id)).toBe(true);
    expect(await hasCreatorAccess(chatter.id, "chatter", otherCreator.id)).toBe(false);
  });

  it("due chatter diversi assegnati a creator diverse non vedono i dati l'uno dell'altro", async () => {
    const chatterA = await createChatter();
    const chatterB = await createChatter();
    const creatorA = await createCreator();
    const creatorB = await createCreator();

    await prisma.adminCreatorAccess.create({ data: { adminUserId: chatterA.id, creatorId: creatorA.id } });
    await prisma.adminCreatorAccess.create({ data: { adminUserId: chatterB.id, creatorId: creatorB.id } });

    expect(await hasCreatorAccess(chatterA.id, "chatter", creatorA.id)).toBe(true);
    expect(await hasCreatorAccess(chatterA.id, "chatter", creatorB.id)).toBe(false);
    expect(await hasCreatorAccess(chatterB.id, "chatter", creatorB.id)).toBe(true);
    expect(await hasCreatorAccess(chatterB.id, "chatter", creatorA.id)).toBe(false);
  });
});
