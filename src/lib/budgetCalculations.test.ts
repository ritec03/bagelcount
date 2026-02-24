import { describe, it, expect } from 'vitest';
import { calculatePeriodSpent, normalizeBudgetAmount } from './budgetCalculations';
import type { Transaction } from './api/types.gen';
import type { BudgetAllocation } from './types';

describe('calculatePeriodSpent', () => {
    // Test Strategy: ZOMBIES - (I) Interface & (B) Boundary
    
    it('should calculate spent amount for a specific month (Standard Monthly)', () => {
        // Arrange
        const transactions: Transaction[] = [
            {
                date: '2026-01-15', // In target
                narration: 'Jan expense',
                postings: [{ account: 'Expenses:Food', units: '50.00 CAD', currency: 'CAD' }]
            },
            {
                date: '2026-02-15', // Out of target
                narration: 'Feb expense',
                postings: [{ account: 'Expenses:Food', units: '60.00 CAD', currency: 'CAD' }]
            }
        ];
        const budgets: BudgetAllocation[] = [{
            account: 'Expenses:Food',
            amount: '500.00',
            currency: 'CAD',
            start_date: '2026-01-01',
            frequency: 'monthly', id: 'test-id', end_date: null
        }];

        // Act
        const result = calculatePeriodSpent(transactions, budgets, 'monthly', new Date(2026, 0, 1));

        // Assert
        expect(result.get('Expenses:Food')).toBe(50.00);
    });

    it('should calculate spent amount for the entire year (Standard Yearly)', () => {
        // Arrange
        const transactions: Transaction[] = [
            {
                date: '2026-01-15', // In target
                narration: 'Jan expense',
                postings: [{ account: 'Expenses:Food', units: '50.00 CAD', currency: 'CAD' }]
            },
            {
                date: '2026-05-20', // In target
                narration: 'May expense',
                postings: [{ account: 'Expenses:Food', units: '60.00 CAD', currency: 'CAD' }]
            },
            {
                date: '2025-12-31', // Out of target
                narration: 'Last year',
                postings: [{ account: 'Expenses:Food', units: '100.00 CAD', currency: 'CAD' }]
            }
        ];
        const budgets: BudgetAllocation[] = [{
            account: 'Expenses:Food',
            amount: '500.00',
            currency: 'CAD',
            start_date: '2026-01-01',
            frequency: 'monthly', id: 'test-id', end_date: null
        }];

        // Act
        const result = calculatePeriodSpent(transactions, budgets, 'yearly', new Date(2026, 5, 1));

        // Assert
        expect(result.get('Expenses:Food')).toBe(110.00);
    });
});



describe('normalizeBudgetAmount', () => {
    describe('to monthly', () => {
        it('yearly → monthly: divides by 12', () => {
            expect(normalizeBudgetAmount(1200, 'yearly', 'monthly')).toBe(100);
        });

        it('quarterly → monthly: divides by 3', () => {
            expect(normalizeBudgetAmount(300, 'quarterly', 'monthly')).toBe(100);
        });

        it('monthly → monthly: identity', () => {
            expect(normalizeBudgetAmount(100, 'monthly', 'monthly')).toBe(100);
        });
    });

    describe('to yearly', () => {
        it('monthly → yearly: multiplies by 12', () => {
            expect(normalizeBudgetAmount(100, 'monthly', 'yearly')).toBe(1200);
        });

        it('quarterly → yearly: multiplies by 4', () => {
            expect(normalizeBudgetAmount(300, 'quarterly', 'yearly')).toBe(1200);
        });

        it('yearly → yearly: identity', () => {
            expect(normalizeBudgetAmount(1200, 'yearly', 'yearly')).toBe(1200);
        });
    });

    describe('to quarterly', () => {
        it('monthly → quarterly: multiplies by 3', () => {
            expect(normalizeBudgetAmount(100, 'monthly', 'quarterly')).toBe(300);
        });

        it('yearly → quarterly: divides by 4', () => {
            expect(normalizeBudgetAmount(1200, 'yearly', 'quarterly')).toBe(300);
        });

        it('quarterly → quarterly: identity', () => {
            expect(normalizeBudgetAmount(300, 'quarterly', 'quarterly')).toBe(300);
        });
    });
});
