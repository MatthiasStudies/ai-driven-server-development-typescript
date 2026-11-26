import { sql } from "drizzle-orm";
import { date, integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .$onUpdate(() => new Date())
    .notNull(),
  version: integer("version").notNull().default(1),
});
