import { z } from "zod";
import { badRequest } from "./problem.js";

export const idSchema = z.coerce.number().int().positive().max(2147483647);
export const dateSchema = z.iso.date();

export function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw badRequest(
      "Request validation failed",
      result.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

export async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw badRequest("Request body must contain valid JSON");
  }
}
