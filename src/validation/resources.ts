import { z } from "zod";
import { dateSchema } from "../http/validate.js";

const name = z.string().min(1).max(100);
const description = z.string().nullable();
const variant = z.string().min(1).max(50).nullable();
const acquiredAt = dateSchema.nullable();

export const createBinderSchema = z.object({
  name,
  description: description.optional(),
}).strict();
export const replaceBinderSchema = z.object({ name, description }).strict();

const cardFields = {
  binderId: z.number().int().positive().max(2147483647),
  name,
  setName: z.string().min(1).max(100),
  collectorNumber: z.string().min(1).max(20),
  rarity: z.string().min(1).max(50),
};
export const createCardSchema = z.object({
  ...cardFields,
  variant: variant.optional(),
  acquiredAt: acquiredAt.optional(),
}).strict();
export const replaceCardSchema = z.object({ ...cardFields, variant, acquiredAt }).strict();

export const createCertificateSchema = z.object({
  gradingCompany: z.string().min(1).max(20),
  certNumber: z.string().min(1).max(50),
  grade: z.number().min(1).max(10).refine((value) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9, "Grade must use increments of 0.1"),
  gradedAt: dateSchema,
}).strict();
