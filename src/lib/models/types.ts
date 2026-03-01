
import type { 
    StandardBudgetOutput, 
    CustomBudgetOutput,
    StandardBudgetInput,
    CustomBudgetInput 
} from '../api/types.gen';

// Output types (Read)
export type BudgetAllocation = StandardBudgetOutput | CustomBudgetOutput;

// Input types (Write)
export type BudgetSubmission = StandardBudgetInput | CustomBudgetInput;

// Re-export specific types for convenience
export type { StandardBudgetOutput, CustomBudgetOutput };

// UI State Types
export type PeriodType = 'monthly' | 'yearly' | 'quarterly';
export type BudgetType = PeriodType | 'custom';
export type NormalizationMode = 'pro-rated' | 'full';

/**
 * Ordered list of every period type, from lowest to highest frequency.
 * This is the single authoritative ordering used when building the unified
 * budget tree (each account segment is followed by these period nodes).
 */
export const PERIOD_TYPE_LIST: readonly PeriodType[] = ['yearly', 'quarterly', 'monthly'] as const;

/**
 * A typed set of every valid {@link PeriodType} value.
 */
export const PERIOD_TYPES: ReadonlySet<PeriodType> = new Set<PeriodType>(PERIOD_TYPE_LIST);

