import { describe, it, expect } from "vitest";
import { calculateTransactionAmount } from "@/lib/transactionUtils";
import type { Transaction } from "@/lib/api/types.gen";

describe("calculateTransactionAmount", () => {
    it("should return amount for exact account match", () => {
        const txn: Transaction = {
            date: "2024-01-01",
            payee: "Test",
            postings: [
                { account: "Expenses:Food", units: "50.00", currency: "CAD" },
                { account: "Assets:Cash", units: "-50.00", currency: "CAD" }
            ],
            narration: "",



        };
        const result = calculateTransactionAmount(txn, "Expenses:Food");
        expect(result.amount).toBe(50.00);
        expect(result.currency).toBe("CAD");
    });

    it("should sum amounts for sub-accounts", () => {
        const txn: Transaction = {
            date: "2024-01-01",
            payee: "Grocery Run",
            postings: [
                { account: "Expenses:Food:Groceries", units: "50.00", currency: "CAD" },
                { account: "Expenses:Food:Dining", units: "20.00", currency: "CAD" },
                { account: "Assets:Cash", units: "-70.00", currency: "CAD" }
            ],
            narration: "",



        };
        // Viewing "Expenses:Food" should aggregate Groceries and Dining
        const result = calculateTransactionAmount(txn, "Expenses:Food");
        expect(result.amount).toBe(70.00);
        expect(result.currency).toBe("CAD");
    });

    it("should handle mixed-expense transactions correctly", () => {
        const txn: Transaction = {
            date: "2024-01-01",
            payee: "Grocery Run",
            postings: [
                { account: "Expenses:Food:Groceries", units: "50.00", currency: "CAD" },
                { account: "Expenses:BankFee", units: "20.00", currency: "CAD" },
                { account: "Assets:Cash", units: "-70.00", currency: "CAD" }
            ],
            narration: "",



        };
        // Viewing "Expenses:Food" should aggregate Groceries and Dining
        const result = calculateTransactionAmount(txn, "Expenses:Food");
        expect(result.amount).toBe(50.00);
        const nextResult = calculateTransactionAmount(txn, "Expenses:BankFee");
        expect(nextResult.amount).toBe(20.00);
        expect(nextResult.currency).toBe("CAD");
    });

    it("should ignore non-matching accounts", () => {
        const txn: Transaction = {
            date: "2024-01-01",
            payee: "Test",
            postings: [
                { account: "Expenses:Auto", units: "100.00", currency: "CAD" },
                { account: "Assets:Cash", units: "-100.00", currency: "CAD" }
            ],
            narration: "",



        };
        const result = calculateTransactionAmount(txn, "Expenses:Food");
        expect(result.amount).toBe(0);
    });

    it("should handle empty postings", () => {
        const txn: Transaction = {
            date: "2024-01-01",
            payee: "Test",
            postings: [],
            narration: "",



        };
        const result = calculateTransactionAmount(txn, "Expenses:Food");
        expect(result.amount).toBe(0);
    });

    it("should handle undefined postings", () => {
        const txn: Transaction = {
            date: "2024-01-01",
            payee: "Test",
            postings: undefined,
            narration: "",



        };
        const result = calculateTransactionAmount(txn, "Expenses:Food");
        expect(result.amount).toBe(0);
    });
});
