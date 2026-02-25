import type { Transaction } from "@/lib/api/types.gen";

interface CalculatedAmount {
    amount: number;
    currency: string;
}

/**
 * Calculates the total amount for a transaction relative to a specific account.
 * Sums up all postings that match the account or its sub-accounts.
 * 
 * @param transaction The transaction to analyze
 * @param accountName The target account name (e.g. "Expenses:Food")
 * @returns The summed amount and currency
 */
export function calculateTransactionAmount(
    transaction: Transaction, 
    accountName: string
): CalculatedAmount {
    if (!transaction.postings || transaction.postings.length === 0) {
        return { amount: 0, currency: "CAD" }; // Default currency
    }

    let totalAmount = 0;
    let currency = "CAD"; // Default fallback
    let foundMatch = false;

    // Use loop to sum all matching postings
    for (const p of transaction.postings) {
        const isMatch = p.account === accountName || 
                        p.account.startsWith(accountName + ":");
        
        if (isMatch) {
            // Parse "50.00 CAD" -> 50.00
            // Assuming simplified format "AMOUNT CURRENCY" or just "AMOUNT"
            // The generated type says units is string
            const val = parseFloat(p.units); 
            if (!isNaN(val)) {
                totalAmount += val;
            }
            
            // Capture currency from the first match (or last, doesn't matter if consistent)
            if (!foundMatch) {
                currency = p.currency;
                foundMatch = true;
            }
        }
    }

    // Edge case: if no match found, we might want to return 0 and maybe the first available currency?
    // For now, if no match, return 0 CAD.
    
    return {
        amount: totalAmount,
        currency: currency
    };
}
