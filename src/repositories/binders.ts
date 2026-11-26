import { and, eq, sql } from "drizzle-orm";
import type { db } from "../db/client.js";
import { binders } from "../db/schema/binders.js";
import { listEnvelope, parseListQuery, totalCount, type ListFields } from "../http/list.js";
import type { createBinderSchema, replaceBinderSchema } from "../validation/resources.js";
import type { z } from "zod";

export type Database = typeof db;

const fields: ListFields = {
  name: { column: binders.name, type: "string", operators: ["eq", "ne", "in", "contains"], sortable: true },
  createdAt: { column: binders.createdAt, type: "timestamp", operators: ["eq", "gte", "lte"], sortable: true },
  updatedAt: { column: binders.updatedAt, type: "timestamp", operators: ["eq", "gte", "lte"], sortable: true },
};

export function binderRepository(database: Database) {
  return {
    async list(owner: string, params: URLSearchParams) {
      const query = parseListQuery(params, fields, binders.id);
      const where = and(eq(binders.ownerUserId, owner), ...query.filters);
      const data = await database.select().from(binders).where(where).orderBy(...query.orderBy).limit(query.pageSize).offset((query.page - 1) * query.pageSize);
      const [count] = await database.select({ total: totalCount }).from(binders).where(where);
      return listEnvelope(data, query.page, query.pageSize, count?.total ?? 0);
    },
    async get(owner: string, id: number) {
      const [item] = await database.select().from(binders).where(and(eq(binders.id, id), eq(binders.ownerUserId, owner)));
      return item;
    },
    async create(owner: string, input: z.infer<typeof createBinderSchema>) {
      const [item] = await database.insert(binders).values({ ...input, ownerUserId: owner }).returning();
      if (!item) throw new Error("Binder insert returned no row");
      return item;
    },
    async replace(owner: string, id: number, version: number | null, input: z.infer<typeof replaceBinderSchema>) {
      const [item] = await database.update(binders).set({ ...input, version: sql`${binders.version} + 1` }).where(and(eq(binders.id, id), eq(binders.ownerUserId, owner), version === null ? undefined : eq(binders.version, version))).returning();
      return item;
    },
  };
}
