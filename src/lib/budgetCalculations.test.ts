import { describe, it, expect } from 'vitest';
import { calculateMonthlySpent, calculatePeriodSpent, normalizeBudgetAmount } from './budgetCalculations';
import type { Transaction } from './api/types.gen';
import type { BudgetAllocation } from './types';

describe('calculateMonthlySpent', () => {
  // Test Strategy: ZOMBIES - (Z) Zero cases
  describe('Zero cases', () => {
    it('should return empty Map when no transactions provided', () => {
      // Arrange
      const transactions: Transaction[] = [];
      const budgets: BudgetAllocation[] = [{
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly', id: 'test-id', end_date: null
      }];
      
      // Act
      const result = calculateMonthlySpent(transactions, budgets, 2026, 0);
      
      // Assert
      expect(result.size).toBe(0);
    });

    it('should return empty Map when no budgets provided', () => {
      // Arrange
      const transactions: Transaction[] = [{
        date: '2026-01-15',
        narration: 'Grocery shopping',
        postings: [{
          account: 'Expenses:Food',
          units: '50.00 CAD',
          currency: 'CAD'
        }]
      }];
      const budgets: BudgetAllocation[] = [];
      
      // Act
      const result = calculateMonthlySpent(transactions, budgets, 2026, 0);
      
      // Assert
      expect(result.size).toBe(0);
    });

    it('should return empty Map when transactions have no postings', () => {
      // Arrange
      const transactions: Transaction[] = [{
        date: '2026-01-15',
        narration: 'Something',
        postings: undefined
      }];
      const budgets: BudgetAllocation[] = [{
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly', id: 'test-id', end_date: null
      }];
      
      // Act
      const result = calculateMonthlySpent(transactions, budgets, 2026, 0);
      
      // Assert
      expect(result.size).toBe(0);
    });
  });

  // Test Strategy: ZOMBIES - (O) One case
  describe('One case', () => {
    it('should correctly calculate spent amount for single transaction', () => {
      // Arrange
      const transactions: Transaction[] = [{
        date: '2026-01-15',
        narration: 'Grocery shopping',
        postings: [{
          account: 'Expenses:Food',
          units: '50.00 CAD',
          currency: 'CAD'
        }]
      }];
      const budgets: BudgetAllocation[] = [{
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly', id: 'test-id', end_date: null
      }];
      
      // Act
      const result = calculateMonthlySpent(transactions, budgets, 2026, 0);
      
      // Assert
      expect(result.get('Expenses:Food')).toBe(50.00);
    });
  });

  // Test Strategy: ZOMBIES - (M) Many cases
  describe('Many cases', () => {
    it('should aggregate multiple transactions for same account', () => {
      // Arrange
      const transactions: Transaction[] = [
        {
          date: '2026-01-10',
          narration: 'Grocery shopping',
          postings: [{
            account: 'Expenses:Food',
            units: '50.00 CAD',
            currency: 'CAD'
          }]
        },
        {
          date: '2026-01-20',
          narration: 'Restaurant',
          postings: [{
            account: 'Expenses:Food',
            units: '75.50 CAD',
            currency: 'CAD'
          }]
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
      const result = calculateMonthlySpent(transactions, budgets, 2026, 0);
      
      // Assert
      expect(result.get('Expenses:Food')).toBe(125.50);
    });

    it('should handle multiple budgets and transactions', () => {
      // Arrange
      const transactions: Transaction[] = [
        {
          date: '2026-01-10',
          narration: 'Grocery',
          postings: [{
            account: 'Expenses:Food',
            units: '50.00 CAD',
            currency: 'CAD'
          }]
        },
        {
          date: '2026-01-15',
          narration: 'Gas',
          postings: [{
            account: 'Expenses:Transport',
            units: '60.00 CAD',
            currency: 'CAD'
          }]
        }
      ];
      const budgets: BudgetAllocation[] = [
        {
          account: 'Expenses:Food',
          amount: '500.00',
          currency: 'CAD',
          start_date: '2026-01-01',
          frequency: 'monthly', id: 'test-id', end_date: null
        },
        {
          account: 'Expenses:Transport',
          amount: '300.00',
          currency: 'CAD',
          start_date: '2026-01-01',
          frequency: 'monthly', id: 'test-id', end_date: null
        }
      ];
      
      // Act
      const result = calculateMonthlySpent(transactions, budgets, 2026, 0);
      
      // Assert
      expect(result.get('Expenses:Food')).toBe(50.00);
      expect(result.get('Expenses:Transport')).toBe(60.00);
    });
  });

  // Test Strategy: ZOMBIES - (B) Boundary cases
  describe('Boundary cases', () => {
    it('should filter out transactions from different months', () => {
      // Arrange
      const transactions: Transaction[] = [
        {
          date: '2026-01-15',
          narration: 'January expense',
          postings: [{
            account: 'Expenses:Food',
            units: '50.00 CAD',
            currency: 'CAD'
          }]
        },
        {
          date: '2026-02-15',
          narration: 'February expense',
          postings: [{
            account: 'Expenses:Food',
            units: '60.00 CAD',
            currency: 'CAD'
          }]
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
      const result = calculateMonthlySpent(transactions, budgets, 2026, 0); // January
      
      // Assert
      expect(result.get('Expenses:Food')).toBe(50.00);
    });

    it('should filter out transactions from different years', () => {
      // Arrange
      const transactions: Transaction[] = [
        {
          date: '2026-01-15',
          narration: '2026 expense',
          postings: [{
            account: 'Expenses:Food',
            units: '50.00 CAD',
            currency: 'CAD'
          }]
        },
        {
          date: '2025-01-15',
          narration: '2025 expense',
          postings: [{
            account: 'Expenses:Food',
            units: '60.00 CAD',
            currency: 'CAD'
          }]
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
      const result = calculateMonthlySpent(transactions, budgets, 2026, 0);
      
      // Assert
      expect(result.get('Expenses:Food')).toBe(50.00);
    });
  });

  // Test Strategy: Account hierarchy matching
  describe('Account hierarchy', () => {
    it('should match child accounts to parent budget', () => {
      // Arrange
      const transactions: Transaction[] = [{
        date: '2026-01-15',
        narration: 'Restaurant expense',
        postings: [{
          account: 'Expenses:Food:Restaurants',
          units: '50.00 CAD',
          currency: 'CAD'
        }]
      }];
      const budgets: BudgetAllocation[] = [{
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly', id: 'test-id', end_date: null
      }];
      
      // Act
      const result = calculateMonthlySpent(transactions, budgets, 2026, 0);
      
      // Assert
      expect(result.get('Expenses:Food')).toBe(50.00);
    });

    it('should aggregate multiple child accounts under parent budget', () => {
      // Arrange
      const transactions: Transaction[] = [
        {
          date: '2026-01-10',
          narration: 'Restaurant',
          postings: [{
            account: 'Expenses:Food:Restaurants',
            units: '50.00 CAD',
            currency: 'CAD'
          }]
        },
        {
          date: '2026-01-15',
          narration: 'Groceries',
          postings: [{
            account: 'Expenses:Food:Groceries',
            units: '100.00 CAD',
            currency: 'CAD'
          }]
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
      const result = calculateMonthlySpent(transactions, budgets, 2026, 0);
      
      // Assert
      expect(result.get('Expenses:Food')).toBe(150.00);
    });

    it('should handle exact account matches', () => {
      // Arrange
      const transactions: Transaction[] = [{
        date: '2026-01-15',
        narration: 'Food expense',
        postings: [{
          account: 'Expenses:Food',
          units: '50.00 CAD',
          currency: 'CAD'
        }]
      }];
      const budgets: BudgetAllocation[] = [{
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly', id: 'test-id', end_date: null
      }];
      
      // Act
      const result = calculateMonthlySpent(transactions, budgets, 2026, 0);
      
      // Assert
      expect(result.get('Expenses:Food')).toBe(50.00);
    });
  });

  // Test Strategy: ZOMBIES - (E) Exceptions/Edge cases
  describe('Exception handling', () => {
    it('should handle invalid amount strings gracefully', () => {
      // Arrange
      const transactions: Transaction[] = [{
        date: '2026-01-15',
        narration: 'Invalid amount',
        postings: [{
          account: 'Expenses:Food',
          units: 'invalid CAD',
          currency: 'CAD'
        }]
      }];
      const budgets: BudgetAllocation[] = [{
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly', id: 'test-id', end_date: null
      }];
      
      // Act
      const result = calculateMonthlySpent(transactions, budgets, 2026, 0);
      
      // Assert
      expect(result.size).toBe(0);
    });

    it('should handle negative amounts', () => {
      // Arrange
      const transactions: Transaction[] = [{
        date: '2026-01-15',
        narration: 'Refund',
        postings: [{
          account: 'Expenses:Food',
          units: '-25.00 CAD',
          currency: 'CAD'
        }]
      }];
      const budgets: BudgetAllocation[] = [{
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly', id: 'test-id', end_date: null
      }];
      
      // Act
      const result = calculateMonthlySpent(transactions, budgets, 2026, 0);
      
      // Assert
      expect(result.get('Expenses:Food')).toBe(-25.00);
    });

    it('should handle transactions with multiple postings', () => {
      // Arrange
      const transactions: Transaction[] = [{
        date: '2026-01-15',
        narration: 'Complex transaction',
        postings: [
          {
            account: 'Expenses:Food',
            units: '50.00 CAD',
            currency: 'CAD'
          },
          {
            account: 'Assets:Checking',
            units: '-50.00 CAD',
            currency: 'CAD'
          }
        ]
      }];
      const budgets: BudgetAllocation[] = [{
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly', id: 'test-id', end_date: null
      }];
      
      // Act
      const result = calculateMonthlySpent(transactions, budgets, 2026, 0);
      
      // Assert
      expect(result.get('Expenses:Food')).toBe(50.00);
    });
  });
});

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
