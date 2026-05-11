// Feature: better-coretax-improvements, Property 4: applyFilters status match

/**
 * Property 4: applyFilters status match
 *
 * For any array of rows and any non-`undefined` `status` option, every row
 * returned by `applyFilters` SHALL have a `Status` field value that equals
 * the `status` option under case-insensitive comparison, and no row with a
 * differing `Status` value SHALL appear in the result.
 *
 * Validates: Requirements 11.5 (b)
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { applyFilters } from "../content/filter";

// Arbitrary for a single row — Status and Name are arbitrary strings;
// InvoiceDate is optionally a valid ISO date string or absent.
const rowArb = fc.record(
  {
    Status: fc.string(),
    Name: fc.string(),
    InvoiceDate: fc.option(fc.constant("2024-01-01"), { nil: undefined }),
  },
  { requiredKeys: [] },
);

describe("applyFilters - Property 4: status match", () => {
  it("all returned rows have Status matching option case-insensitively", () => {
    // **Validates: Requirements 11.5 (b)**
    fc.assert(
      fc.property(
        fc.array(rowArb),
        fc.string(),
        (rows, status) => {
          const result = applyFilters(rows as Record<string, unknown>[], { status });

          for (const row of result) {
            const rowStatus = String(row["Status"] ?? "");
            expect(rowStatus.toLowerCase()).toBe(status.toLowerCase());
          }
        },
      ),
    );
  });

  it("rows with non-matching Status are excluded", () => {
    // **Validates: Requirements 11.5 (b)**
    fc.assert(
      fc.property(
        fc.array(rowArb),
        fc.string(),
        (rows, status) => {
          const result = applyFilters(rows as Record<string, unknown>[], { status });

          // Every row that was NOT returned must have had a non-matching Status
          const resultSet = new Set(result);
          for (const row of rows as Record<string, unknown>[]) {
            if (!resultSet.has(row)) {
              const rowStatus = String(row["Status"] ?? "");
              expect(rowStatus.toLowerCase()).not.toBe(status.toLowerCase());
            }
          }
        },
      ),
    );
  });

  it("absent status option passes all rows through", () => {
    // **Validates: Requirements 11.5 (b)** — absent option passes all rows
    fc.assert(
      fc.property(fc.array(rowArb), (rows) => {
        const result = applyFilters(rows as Record<string, unknown>[], {});
        expect(result).toHaveLength(rows.length);
      }),
    );
  });
});
