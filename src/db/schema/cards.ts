import { sql } from "drizzle-orm";
import { date, integer, pgTable, serial, varchar } from "drizzle-orm/pg-core";
import { binders } from "./binders.js";

export const cards = pgTable("cards", {
  id: serial("id").primaryKey(),
  binderId: integer("binder_id")
    .notNull()
    .references(() => binders.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  setName: varchar("set_name", { length: 100 }).notNull(),
  collectorNumber: varchar("collector_number", { length: 20 }).notNull(),
  rarity: varchar("rarity", { length: 50 }).notNull(),
  variant: varchar("variant", { length: 50 }).default("Standard"),
  acquiredAt: date("acquired_at").default(sql`CURRENT_DATE`),
  version: integer("version").notNull().default(1),
});
