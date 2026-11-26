import { and, eq, exists, sql } from "drizzle-orm";
import type { z } from "zod";
import { binders } from "../db/schema/binders.js";
import { cards } from "../db/schema/cards.js";
import { gradingCertificates } from "../db/schema/grading-certificates.js";
import type { createCertificateSchema } from "../validation/resources.js";
import type { Database } from "./binders.js";

export function certificateRepository(database: Database) {
  return {
    async get(owner: string, cardId: number) {
      const [row] = await database
        .select({ certificate: gradingCertificates })
        .from(gradingCertificates)
        .innerJoin(cards, eq(cards.id, gradingCertificates.cardId))
        .innerJoin(binders, eq(binders.id, cards.binderId))
        .where(and(eq(cards.id, cardId), eq(binders.ownerUserId, owner)));
      return row?.certificate;
    },
    async create(owner: string, cardId: number, input: z.infer<typeof createCertificateSchema>) {
      return database.transaction(async (tx) => {
        // The update locks the card and invalidates its detail ETag in the same
        // transaction as the certificate insert. A failed insert rolls it back.
        const ownedBinder = exists(
          tx
            .select({ id: binders.id })
            .from(binders)
            .where(and(eq(binders.id, cards.binderId), eq(binders.ownerUserId, owner))),
        );
        const [card] = await tx
          .update(cards)
          .set({ version: sql`${cards.version} + 1` })
          .where(and(eq(cards.id, cardId), ownedBinder))
          .returning({ id: cards.id });
        if (!card) return undefined;
        const [certificate] = await tx
          .insert(gradingCertificates)
          .values({ ...input, cardId, grade: input.grade.toFixed(1) })
          .returning();
        if (!certificate) throw new Error("Certificate insert returned no row");
        return certificate;
      });
    },
  };
}

export function isCertificateConflict(error: unknown): boolean {
  let cause: unknown = error;
  for (let depth = 0; depth < 4 && cause && typeof cause === "object"; depth++) {
    if (
      "code" in cause &&
      cause.code === "23505" &&
      "constraint" in cause &&
      (cause.constraint === "grading_certificates_card_id_key" ||
        cause.constraint === "grading_certificates_cert_number_key")
    )
      return true;
    cause = "cause" in cause ? cause.cause : undefined;
  }
  return false;
}
