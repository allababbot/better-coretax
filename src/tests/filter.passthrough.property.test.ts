// Feature: better-coretax-improvements, Property 6: applyFilters absent options pass all rows
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { applyFilters } from "../content/filter";

/**
 * Arbitrary for a single data row.
 * All keys are optional so we exercise rows with various combinations of fields,
 * including rows that have no InvoiceDate, no Status, and no string fields at all.
 */
const rowArb = fc.record(
  {
    Status: fc.string(),
    Name: fc.string(),
    InvoiceDate: fc.option(fc.constant("2024-01-01"), { nil: undefined }),
    Amount: fc.integer(),
  },
  { requiredKeys: [] },
);

describe("applyFilters - Property 6: absent options pass all rows", () => {
  it("with empty FilterOptions, result equals input (same rows, same order)", () => {
    // Validates: Requirements 11.5 (a, b, c)
    fc.assert(
      fc.property(fc.array(rowArb), (rows) => {
        const result = applyFilters(rows as Record<string, unknown>[], {});

        // Every input row must appear in the output
        expect(result.length).toBe(rows.length);

        // Order must be preserved and rows must be reference-equal (no cloning)
        for (let i = 0; i < rows.length; i++) {
          expect(result[i]).toBe(rows[i]);
        }
      }),
    );
  });
});
