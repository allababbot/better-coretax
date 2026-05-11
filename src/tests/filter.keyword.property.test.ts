// Feature: better-coretax-improvements, Property 5: applyFilters keyword match
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { applyFilters } from "../content/filter";

/**
 * Validates: Requirements 11.5 (c)
 *
 * Property 5: applyFilters keyword match
 * For any array of rows and any non-undefined keyword option, every row returned
 * by applyFilters SHALL contain the keyword as a case-insensitive substring in at
 * least one of its string-typed field values, and no row that lacks the keyword in
 * all string fields SHALL appear in the result.
 */

const rowArb = fc.record(
  {
    Status: fc.string(),
    Name: fc.string(),
    Description: fc.string(),
    Amount: fc.integer(),
  },
  { requiredKeys: [] },
);

describe("applyFilters - Property 5: keyword match", () => {
  it("all returned rows contain keyword in at least one string field", () => {
    fc.assert(
      fc.property(
        fc.array(rowArb),
        fc.string(),
        (rows, keyword) => {
          const result = applyFilters(rows as Record<string, unknown>[], { keyword });
          const kw = keyword.toLowerCase();
          for (const row of result) {
            const hasMatch = Object.values(row).some(
              (v) => typeof v === "string" && v.toLowerCase().includes(kw),
            );
            expect(hasMatch).toBe(true);
          }
        },
      ),
    );
  });

  it("no row lacking the keyword in all string fields appears in the result", () => {
    fc.assert(
      fc.property(
        fc.array(rowArb),
        fc.string(),
        (rows, keyword) => {
          const result = applyFilters(rows as Record<string, unknown>[], { keyword });
          const kw = keyword.toLowerCase();
          // Every row in the input that does NOT match should NOT be in the result
          const nonMatchingInputRows = (rows as Record<string, unknown>[]).filter((row) =>
            !Object.values(row).some(
              (v) => typeof v === "string" && v.toLowerCase().includes(kw),
            ),
          );
          for (const nonMatchRow of nonMatchingInputRows) {
            expect(result).not.toContain(nonMatchRow);
          }
        },
      ),
    );
  });

  it("absent keyword option passes all rows through unchanged", () => {
    fc.assert(
      fc.property(fc.array(rowArb), (rows) => {
        const result = applyFilters(rows as Record<string, unknown>[], {});
        expect(result).toEqual(rows);
      }),
    );
  });
});
