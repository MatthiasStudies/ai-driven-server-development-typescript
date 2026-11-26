import { and, eq, exists, sql } from "drizzle-orm";
import type { z } from "zod";
import { binders } from "../db/schema/binders.js";
import { cards } from "../db/schema/cards.js";
import { gradingCertificates } from "../db/schema/grading-certificates.js";
import { listEnvelope, parseListQuery, totalCount, type ListFields } from "../http/list.js";
import type { createCardSchema, replaceCardSchema } from "../validation/resources.js";
import type { Database } from "./binders.js";

const textOps = ["eq", "ne", "in", "contains"] as const;
const fields: ListFields = {
  name: { column: cards.name, type: "string", operators: textOps, sortable: true },
  setName: { column: cards.setName, type: "string", operators: textOps, sortable: true },
  rarity: { column: cards.rarity, type: "string", operators: textOps, sortable: true },
  variant: { column: cards.variant, type: "string", operators: textOps },
  collectorNumber: { column: cards.collectorNumber, type: "string", operators: textOps },
  binderId: { column: cards.binderId, type: "integer", operators: ["eq", "in"] },
  acquiredAt: { column: cards.acquiredAt, type: "date", operators: ["eq", "gte", "lte"], sortable: true },
  createdAt: { column: cards.createdAt, type: "timestamp", operators: ["eq", "gte", "lte"], sortable: true },
  updatedAt: { column: cards.updatedAt, type: "timestamp", operators: ["eq", "gte", "lte"], sortable: true },
};

export function cardRepository(database: Database) {
  return {
    async list(owner: string, params: URLSearchParams) {
      const query = parseListQuery(params, fields, cards.id);
      const where = and(eq(binders.ownerUserId, owner), ...query.filters);
      const data = await database.select({ card: cards }).from(cards).innerJoin(binders, eq(cards.binderId, binders.id)).where(where).orderBy(...query.orderBy).limit(query.pageSize).offset((query.page - 1) * query.pageSize);
      const [count] = await database.select({ total: totalCount }).from(cards).innerJoin(binders, eq(cards.binderId, binders.id)).where(where);
      return listEnvelope(data.map(({ card }) => card), query.page, query.pageSize, count?.total ?? 0);
    },
    async get(owner: string, id: number) {
      const [row] = await database.select({ card: cards, gradingCertificate: gradingCertificates }).from(cards).innerJoin(binders, eq(cards.binderId, binders.id)).leftJoin(gradingCertificates, eq(gradingCertificates.cardId, cards.id)).where(and(eq(cards.id, id), eq(binders.ownerUserId, owner)));
      return row ? { ...row.card, gradingCertificate: row.gradingCertificate } : undefined;
    },
    async ownsBinder(owner: string, id: number) {
      const [row] = await database.select({ id: binders.id }).from(binders).where(and(eq(binders.id, id), eq(binders.ownerUserId, owner)));
      return !!row;
    },
    async create(owner: string, input: z.infer<typeof createCardSchema>) {
      return database.transaction(async (tx) => {
        const [binder] = await tx.select({ id: binders.id }).from(binders).where(and(eq(binders.id, input.binderId), eq(binders.ownerUserId, owner))).for("update");
        if (!binder) return undefined;
        const [card] = await tx.insert(cards).values(input).returning();
        if (!card) throw new Error("Card insert returned no row");
        return { ...card, gradingCertificate: null };
      });
    },
    async replace(owner: string, id: number, version: number | null, input: z.infer<typeof replaceCardSchema>) {
      const ownsCurrent = exists(database.select({ id: binders.id }).from(binders).where(and(eq(binders.id, cards.binderId), eq(binders.ownerUserId, owner))));
      const ownsTarget = exists(database.select({ id: binders.id }).from(binders).where(and(eq(binders.id, input.binderId), eq(binders.ownerUserId, owner))));
      const [card] = await database.update(cards).set({ ...input, version: sql`${cards.version} + 1` }).where(and(eq(cards.id, id), ownsCurrent, ownsTarget, version === null ? undefined : eq(cards.version, version))).returning();
      return card;
    },
  };
}
