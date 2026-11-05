import {describe, expect, it} from "vitest";
import {lineTotal, planTotals} from "@dentalClinicModule/utilities/services/treatmentPlans";

const line = (unitPrice: number, quantity = 1, discount?: number) => ({phase: 1, kind: "treatment" as const, name: "x", teeth: [], quantity, unitPrice, discount});

describe("treatment plan totals (D35)", () => {
    it("takes a percent deposit exactly, where float math was a cent short", () => {
        // 19 % of 42.50 is 8.075
        expect(planTotals([line(42.5)], "percent", 19)).toEqual({subtotal: 42.5, discount: 0, total: 42.5, deposit: 8.08});
    });

    it("subtracts line discounts and sums lines without float drift", () => {
        expect(lineTotal(line(0.1, 3, 0.2))).toBe(0.1);
        expect(planTotals([line(0.1, 3), line(0.2, 1, 0.05)], "fixed", 1)).toEqual({subtotal: 0.5, discount: 0.05, total: 0.45, deposit: 0.45});
    });
});
