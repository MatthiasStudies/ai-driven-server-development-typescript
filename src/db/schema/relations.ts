import { relations } from "drizzle-orm";
import { binders } from "./binders.js";
import { cards } from "./cards.js";
import { gradingCertificates } from "./grading-certificates.js";

export const bindersRelations = relations(binders, ({ many }) => ({
  cards: many(cards),
}));

export const cardsRelations = relations(cards, ({ one }) => ({
  binder: one(binders, {
    fields: [cards.binderId],
    references: [binders.id],
  }),
  gradingCertificate: one(gradingCertificates),
}));

export const gradingCertificatesRelations = relations(gradingCertificates, ({ one }) => ({
  card: one(cards, {
    fields: [gradingCertificates.cardId],
    references: [cards.id],
  }),
}));
