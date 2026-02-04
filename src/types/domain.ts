/**
 * Core Domain Models for Bagelcount
 * 
 * Maps Beancount concepts to the Frontend UI hierarchy.
 */

// Represents a money amount
export type Amount = {
  number: number;
  currency: string; // e.g. "USD"
};

// Represents a Node in the Envelope Hierarchy
// "Expenses:Food:Groceries" would be nested.
export type EnvelopeNode = {
  name: string;      // Leaf name, e.g., "Groceries"
  fullName: string;  // Full account name, e.g., "Expenses:Food:Groceries"
  
  // Core "Source of Truth" Data for the Period
  allocated: Amount; // Sum of 'custom "budget"' directives for this node specifically
  activity: Amount;  // Sum of actual transactions (postings) to this account
  
  // Hierarchy
  children: EnvelopeNode[];
  
  // NOTE: 'Available' is effectively (allocated - activity) and calculated by the UI.
  // NOTE: 'Balance' (Carryover) is currently out of scope based on strict monthly envelope rules.
};

// Represents the Budget View for a specific period
export type BudgetPeriod = {
  date: Date; // The start date of the period (e.g., 2025-01-01)
  income: Amount; // Total income transactions for the month
  
  // Budgeted amount is sum(rootEnvelopes.allocated recursively)
  // ToBeBudgeted is (income - budgeted)
  
  rootEnvelopes: EnvelopeNode[]; // Top-level categories (e.g. "Expenses")
};

// Represents a transaction (Read-only for now)
export type Transaction = {
  id: string; // hash or unique ref
  date: Date;
  payee: string;
  narration: string;
  postings: {
    account: string;
    amount: Amount;
  }[];
};
