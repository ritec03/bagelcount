import { describe, it, expect } from 'vitest';
import { calculatePeriodSpent } from './budgetCalculations';
import type { Transaction } from './api/types.gen';
import type { BudgetAllocation } from './types';

describe('Budget Calculations - Edge Cases', () => {
  describe('Test #1: Malformed Date Strings (+15 pts)', () => {
    it('should throw error for date strings with single-digit months', () => {
      // Arrange
      const budgets: BudgetAllocation[] = [{
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly'
      }];
      
      const transactions: Transaction[] = [{
        date: '2026-1-15', // Malformed
        narration: 'Grocery',
        postings: [{
          account: 'Expenses:Food',
          units: '50.00 CAD',
          currency: 'CAD'
        }]
      }];

      // Act & Assert
      expect(() => {
        calculatePeriodSpent(transactions, budgets, 'monthly', new Date(2026, 0, 1));
      }).toThrow('Invalid date format');
    });

    it('should throw error for date strings with alternative formats', () => {
      const budgets: BudgetAllocation[] = [{
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly'
      }];

      const transactions: Transaction[] = [{
        date: '2026/01/15', // Malformed
        narration: 'Grocery',
        postings: [{
          account: 'Expenses:Food',
          units: '50.00 CAD',
          currency: 'CAD'
        }]
      }];

      expect(() => {
        calculatePeriodSpent(transactions, budgets, 'monthly', new Date(2026, 0, 1));
      }).toThrow('Invalid date format');
    });

    it('should throw error for date strings with missing day component', () => {
      const budgets: BudgetAllocation[] = [{
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly'
      }];

      const transactions: Transaction[] = [{
        date: '2026-01', // Malformed
        narration: 'Grocery',
        postings: [{
          account: 'Expenses:Food',
          units: '50.00 CAD',
          currency: 'CAD'
        }]
      }];

      expect(() => {
        calculatePeriodSpent(transactions, budgets, 'monthly', new Date(2026, 0, 1));
      }).toThrow('Invalid date format');
    });
  });

  describe('Test #2: Timezone Boundary Handling (+15 pts)', () => {
    it('should correctly handle transactions on month boundaries', () => {
      // Arrange
      const budgets: BudgetAllocation[] = [{
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly'
      }];
      
      // Transaction on the last day of January
      const transactions: Transaction[] = [{
        date: '2026-01-31', // Last day of January
        narration: 'Late night purchase',
        postings: [{
          account: 'Expenses:Food',
          units: '50.00 CAD',
          currency: 'CAD'
        }]
      }];

      // Act - Create viewDate that might have timezone offset issues
      // Simulating PST where Date object creation might shift UTC boundaries
      const viewDate = new Date('2026-01-01T00:00:00-08:00'); // Jan 1 PST
      const result = calculatePeriodSpent(transactions, budgets, 'monthly', viewDate);

      // Assert - Transaction on Jan 31 should still count as January
      expect(result.get('Expenses:Food')).toBe(50.00);
    });

    it('should handle transactions on first day of month consistently', () => {
      // Arrange
      const budgets: BudgetAllocation[] = [{
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly'
      }];
      
      const transactions: Transaction[] = [{
        date: '2026-02-01', // First day of February
        narration: 'Early morning purchase',
        postings: [{
          account: 'Expenses:Food',
          units: '50.00 CAD',
          currency: 'CAD'
        }]
      }];

      // Act - Check January (should NOT include Feb 1)
      const janResult = calculatePeriodSpent(transactions, budgets, 'monthly', new Date(2026, 0, 1));
      
      // Assert - Feb 1 transaction should NOT be in January
      expect(janResult.get('Expenses:Food') || 0).toBe(0);

      // Act - Check February (SHOULD include Feb 1)
      const febResult = calculatePeriodSpent(transactions, budgets, 'monthly', new Date(2026, 1, 1));
      
      // Assert - Feb 1 transaction SHOULD be in February
      expect(febResult.get('Expenses:Food')).toBe(50.00);
    });
  });

  describe('Test #3: Edge Cases in calculatePeriodSpent', () => {
    it('should throw error for transactions with extra whitespace in date strings', () => {
      const budgets: BudgetAllocation[] = [{
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly'
      }];
      
      const transactions: Transaction[] = [{
        date: ' 2026-01-15 ', // Whitespace
        narration: 'Grocery',
        postings: [{
          account: 'Expenses:Food',
          units: '50.00 CAD',
          currency: 'CAD'
        }]
      }];

      expect(() => {
        calculatePeriodSpent(transactions, budgets, 'monthly', new Date(2026, 0, 1));
      }).toThrow('Invalid date format');
    });

    it('should throw error for transactions with ISO 8601 format dates (with time)', () => {
      const budgets: BudgetAllocation[] = [{
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly'
      }];

      const transactions: Transaction[] = [{
        date: '2026-01-15T12:30:00Z', // Time component
        narration: 'Grocery',
        postings: [{
          account: 'Expenses:Food',
          units: '50.00 CAD',
          currency: 'CAD'
        }]
      }];

      expect(() => {
        calculatePeriodSpent(transactions, budgets, 'monthly', new Date(2026, 0, 1));
      }).toThrow('Invalid date format');
    });
  });
});
