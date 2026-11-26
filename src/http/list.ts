import { asc, desc, eq, gte, ilike, inArray, lte, ne, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import { badRequest } from "./problem.js";
import { dateSchema, validate } from "./validate.js";

export type FilterOperator = "eq" | "ne" | "in" | "contains" | "gte" | "lte";
export interface ListField {
  column: AnyPgColumn;
  type: "string" | "date" | "integer" | "timestamp";
  operators: readonly FilterOperator[];
  sortable?: boolean;
}
export type ListFields = Record<string, ListField>;
export interface ListQuery {
  page: number;
  pageSize: number;
  filters: SQL[];
  orderBy: SQL[];
}

const positiveInteger = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(2147483647));
const timestamp = z.iso.datetime({ offset: true });

function valueFor(field: ListField, input: string): string | number | Date {
  if (field.type === "integer") return validate(positiveInteger, input);
  if (field.type === "date") return validate(dateSchema, input);
  if (field.type === "timestamp") return new Date(validate(timestamp, input));
  return validate(z.string().min(1).max(1000), input);
}

export function parseListQuery(params: URLSearchParams, fields: ListFields, tieBreaker: AnyPgColumn): ListQuery {
  const seen = new Set<string>();
  let page = 1;
  let pageSize = 20;
  const filters: SQL[] = [];
  const orderBy: SQL[] = [];
  for (const [key, value] of params) {
    if (seen.has(key)) throw badRequest(`Duplicate query parameter: ${key}`);
    seen.add(key);
    if (key === "page") {
      page = validate(positiveInteger, value);
    } else if (key === "pageSize") {
      pageSize = validate(positiveInteger.pipe(z.number().max(100)), value);
    } else if (key === "sort") {
      const sortFields = value.split(",");
      const sorted = new Set<string>();
      for (const item of sortFields) {
        const name = item.startsWith("-") ? item.slice(1) : item;
        const field = fields[name];
        if (!field?.sortable || sorted.has(name)) throw badRequest(`Invalid sort field: ${item}`);
        sorted.add(name);
        orderBy.push(item.startsWith("-") ? desc(field.column) : asc(field.column));
      }
    } else {
      const match = /^filter\.([A-Za-z][A-Za-z0-9]*)\.(eq|ne|in|contains|gte|lte)$/.exec(key);
      const field = match?.[1] ? fields[match[1]] : undefined;
      const op = match?.[2] as FilterOperator | undefined;
      if (!field || !op || !field.operators.includes(op)) throw badRequest(`Invalid query parameter: ${key}`);
      const { column } = field;
      if (op === "in") {
        const parts = value.split(",");
        if (parts.length > 100) throw badRequest("An in filter may contain at most 100 values");
        filters.push(inArray(column, parts.map((part) => valueFor(field, part))));
      } else {
        const parsed = valueFor(field, value);
        switch (op) {
          case "eq": filters.push(eq(column, parsed)); break;
          case "ne": filters.push(ne(column, parsed)); break;
          case "gte": filters.push(gte(column, parsed)); break;
          case "lte": filters.push(lte(column, parsed)); break;
          case "contains": filters.push(ilike(column, `%${String(parsed).replace(/[\\%_]/g, "\\$&")}%`)); break;
        }
      }
    }
  }
  if ((page - 1) * pageSize > 2147483647) throw badRequest("Requested page is too large");
  // Stable order across pages even when sort values are equal.
  orderBy.push(asc(tieBreaker));
  return { page, pageSize, filters, orderBy };
}

export function listEnvelope<T>(data: T[], page: number, pageSize: number, total: number) {
  return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export const totalCount = sql<number>`count(*)::int`;
