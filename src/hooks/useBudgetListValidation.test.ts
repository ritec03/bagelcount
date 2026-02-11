import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBudgetListValidation } from './useBudgetListValidation';
import type { StandardBudgetOutput } from '../lib/types';

const createBudget = (
    account: string,
    amount: string,
    frequency: 'monthly' | 'quarterly' | 'yearly'
): StandardBudgetOutput => ({
    account,
    amount,
    frequency,
    currency: 'CAD',
    start_date: '2026-01-01',
    tags: []
});

describe('useBudgetListValidation', () => {
    it('should return an empty map for undefined budgets', () => {
        const { result } = renderHook(() => useBudgetListValidation(undefined));
        expect(result.current.size).toBe(0);
    });

    it('should return an empty map for empty budgets', () => {
        const { result } = renderHook(() => useBudgetListValidation([]));
        expect(result.current.size).toBe(0);
    });

    it('should compute validation results keyed by account:frequency', () => {
        const budgets = [
            createBudget('Expenses:Food', '1000', 'monthly'),
            createBudget('Expenses:Food:Groceries', '600', 'monthly'),
        ];

        const { result } = renderHook(() => useBudgetListValidation(budgets));

        expect(result.current.size).toBe(2);
        expect(result.current.has('Expenses:Food:monthly')).toBe(true);
        expect(result.current.has('Expenses:Food:Groceries:monthly')).toBe(true);

        const parentResult = result.current.get('Expenses:Food:monthly')!;
        expect(parentResult.isValid).toBe(true);

        const childResult = result.current.get('Expenses:Food:Groceries:monthly')!;
        expect(childResult.isValid).toBe(true);
    });

    it('should detect validation errors for conflicting budgets', () => {
        const budgets = [
            createBudget('Expenses:Food', '1000', 'yearly'),
            createBudget('Expenses:Food:Groceries', '600', 'monthly'),
        ];

        const { result } = renderHook(() => useBudgetListValidation(budgets));

        const childResult = result.current.get('Expenses:Food:Groceries:monthly')!;
        expect(childResult.isValid).toBe(false);
        expect(childResult.error).toContain('Exceeds parent budget');
    });

    it('should skip custom budgets', () => {
        const budgets = [
            { account: 'Project:Renovation', amount: '5000', currency: 'CAD', start_date: '2026-01-01', end_date: '2026-06-01', tags: [] },
        ];

        const { result } = renderHook(() => useBudgetListValidation(budgets));
        expect(result.current.size).toBe(0);
    });

    it('should memoize results for the same input', () => {
        const budgets = [createBudget('Expenses:Food', '1000', 'monthly')];

        const { result, rerender } = renderHook(() => useBudgetListValidation(budgets));
        const firstResult = result.current;
        rerender();
        const secondResult = result.current;

        expect(firstResult).toBe(secondResult);
    });
});
