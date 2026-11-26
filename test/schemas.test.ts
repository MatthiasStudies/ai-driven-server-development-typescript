import { describe, expect, it } from "vitest";
import {
  createBinderSchema,
  createCardSchema,
  createCertificateSchema,
  replaceBinderSchema,
  replaceCardSchema,
} from "../src/validation/resources.js";

const card = {
  binderId: 1,
  name: "Charizard",
  setName: "Base Set",
  collectorNumber: "4/102",
  rarity: "Holo Rare",
};
const certificate = {
  gradingCompany: "PSA",
  certNumber: "CERT-1",
  grade: 9.5,
  gradedAt: "2024-03-01",
};

describe("resource validation", () => {
  it("validates binder create and full replacement", () => {
    expect(createBinderSchema.safeParse({ name: "Cards" }).success).toBe(true);
    expect(createBinderSchema.safeParse({ name: "", ownerUserId: "other" }).success).toBe(false);
    expect(replaceBinderSchema.safeParse({ name: "Cards" }).success).toBe(false);
    expect(replaceBinderSchema.safeParse({ name: "Cards", description: null }).success).toBe(true);
  });

  it("validates card fields, strict body and complete replacement", () => {
    expect(createCardSchema.safeParse(card).success).toBe(true);
    expect(createCardSchema.safeParse({ ...card, binderId: -1 }).success).toBe(false);
    expect(createCardSchema.safeParse({ ...card, extra: true }).success).toBe(false);
    expect(replaceCardSchema.safeParse(card).success).toBe(false);
    expect(
      replaceCardSchema.safeParse({ ...card, variant: "Standard", acquiredAt: "2024-03-01" })
        .success,
    ).toBe(true);
    expect(createCardSchema.safeParse({ ...card, acquiredAt: "2024-02-30" }).success).toBe(false);
  });

  it("validates certificate grade, date and lengths", () => {
    expect(createCertificateSchema.safeParse(certificate).success).toBe(true);
    expect(createCertificateSchema.safeParse({ ...certificate, grade: 10.1 }).success).toBe(false);
    expect(createCertificateSchema.safeParse({ ...certificate, grade: 0.9 }).success).toBe(false);
    expect(createCertificateSchema.safeParse({ ...certificate, grade: 9.55 }).success).toBe(false);
    expect(
      createCertificateSchema.safeParse({ ...certificate, gradedAt: "2024-02-30" }).success,
    ).toBe(false);
    expect(
      createCertificateSchema.safeParse({ ...certificate, certNumber: "x".repeat(51) }).success,
    ).toBe(false);
  });
});
