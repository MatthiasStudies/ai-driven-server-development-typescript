import { sql } from "drizzle-orm";
import { check, date, integer, numeric, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { cards } from "./cards.js";

export const gradingCertificates = pgTable(
  "grading_certificates",
  {
    id: serial("id").primaryKey(),
    cardId: integer("card_id")
      .notNull()
      .unique("grading_certificates_card_id_key")
      .references(() => cards.id, { onDelete: "cascade" }),
    gradingCompany: varchar("grading_company", { length: 20 }).notNull(),
    certNumber: varchar("cert_number", { length: 50 })
      .notNull()
      .unique("grading_certificates_cert_number_key"),
    grade: numeric("grade", { precision: 3, scale: 1 }).notNull(),
    gradedAt: date("graded_at").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "grading_certificates_grade_check",
      sql`${table.grade} >= 1.0 AND ${table.grade} <= 10.0`,
    ),
  ],
);
