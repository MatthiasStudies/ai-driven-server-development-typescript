import { describe, expect, it } from "vitest";
import { binders } from "../src/db/schema/binders.js";
import { listEnvelope, parseListQuery, type ListFields } from "../src/http/list.js";

const fields: ListFields = {
  name: {
    column: binders.name,
    type: "string",
    sortable: true,
    operators: ["eq", "ne", "in", "contains"],
  },
  createdAt: {
    column: binders.createdAt,
    type: "timestamp",
    sortable: true,
    operators: ["eq", "gte", "lte"],
  },
};

const parse = (query: string) => parseListQuery(new URLSearchParams(query), fields, binders.id);

describe("list query validation", () => {
  it("defaults to a stable first page", () => {
    expect(parse("")).toMatchObject({ page: 1, pageSize: 20, filters: [] });
    expect(parse("").orderBy).toHaveLength(1);
  });

  it("accepts whitelisted sort fields and every supported filter operator", () => {
    const query = new URLSearchParams({
      page: "2",
      pageSize: "10",
      sort: "-name,createdAt",
      "filter.name.eq": "Card",
      "filter.name.ne": "Other",
      "filter.name.in": "Card,Another",
      "filter.name.contains": "ar",
      "filter.createdAt.gte": "2024-01-01T00:00:00Z",
      "filter.createdAt.lte": "2025-01-01T00:00:00Z",
    });
    const result = parseListQuery(query, fields, binders.id);
    expect(result).toMatchObject({ page: 2, pageSize: 10 });
    expect(result.filters).toHaveLength(6);
    expect(result.orderBy).toHaveLength(3);
  });

  it.each([
    "page=0",
    "page=1&page=2",
    "pageSize=101",
    "sort=unknown",
    "sort=name,-name",
    "filter.name.gte=value",
    "filter.name.in=first,",
    "filter.unknown.eq=value",
    "unexpected=value",
  ])("rejects invalid query %s", (query) => {
    expect(() => parse(query)).toThrow();
  });

  it("returns page metadata", () => {
    expect(listEnvelope([1], 2, 10, 21)).toEqual({
      data: [1],
      meta: { page: 2, pageSize: 10, total: 21, totalPages: 3 },
    });
  });
});
