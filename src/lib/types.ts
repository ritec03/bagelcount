
import type { 
    StandardBudgetOutput, 
    CustomBudgetOutput,
    StandardBudgetInput,
    CustomBudgetInput 
} from './api/types.gen';

// Output types (Read)
export type BudgetAllocation = StandardBudgetOutput | CustomBudgetOutput;

// Input types (Write)
export type BudgetSubmission = StandardBudgetInput | CustomBudgetInput;

// Re-export specific types for convenience
export type { StandardBudgetOutput, CustomBudgetOutput };

// UI State Types
export type PeriodType = 'monthly' | 'yearly' | 'quarterly';
export type NormalizationMode = 'pro-rated' | 'full';
