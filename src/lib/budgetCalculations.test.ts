import { describe, it, expect } from 'vitest';
import { calculateMonthlySpent, calculatePeriodSpent, filterBudgetsByMode } from './budgetCalculations';
import type { Transaction } from './api/types.gen';
import type { BudgetAllocation, NormalizationMode } from './types';

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
        frequency: 'monthly'
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
        frequency: 'monthly'
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
        frequency: 'monthly'
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
        frequency: 'monthly'
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
          frequency: 'monthly'
        },
        {
          account: 'Expenses:Transport',
          amount: '300.00',
          currency: 'CAD',
          start_date: '2026-01-01',
          frequency: 'monthly'
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
        frequency: 'monthly'
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
        frequency: 'monthly'
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
        frequency: 'monthly'
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
        frequency: 'monthly'
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
        frequency: 'monthly'
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
        frequency: 'monthly'
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
        frequency: 'monthly'
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
        frequency: 'monthly'
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
            frequency: 'monthly'
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
            frequency: 'monthly'
        }];

        // Act
        const result = calculatePeriodSpent(transactions, budgets, 'yearly', new Date(2026, 5, 1));

        // Assert
        expect(result.get('Expenses:Food')).toBe(110.00);
    });
});

describe('filterBudgetsByMode', () => {
    const jan1 = new Date(2024, 0, 1); // Jan 1 2024
    const jun1 = new Date(2024, 5, 1); // Jun 1 2024
    const dec1 = new Date(2024, 11, 1); // Dec 1 2024

    const monthlyBudget: BudgetAllocation = {
        account: 'Expenses:Monthly',
        amount: '100',
        currency: 'USD',
        start_date: '2024-01-01', // Starts Jan 1
        frequency: 'monthly'
    };

    const futureMonthlyBudget: BudgetAllocation = {
        account: 'Expenses:Future',
        amount: '100',
        currency: 'USD',
        start_date: '2025-01-01',
        frequency: 'monthly'
    };

    const yearlyBudget: BudgetAllocation = {
        account: 'Expenses:Yearly',
        amount: '1200',
        currency: 'USD',
        start_date: '2024-01-01',
        frequency: 'yearly'
    };

    const projectBudget: BudgetAllocation = {
        account: 'Expenses:Project',
        amount: '500',
        start_date: '2024-01-01',
        end_date: '2024-06-30'
    }; // Custom (no frequency)

    const mode: NormalizationMode = 'full'; // Should be ignored by filtering logic

    describe('Date Overlap Logic', () => {
        it('should exclude budgets starting in the future', () => {
            // Asking for monthly budgets on Jan 1 2024. Future budget starts 2025.
            const result = filterBudgetsByMode([monthlyBudget, futureMonthlyBudget], 'monthly', mode, jan1);
            expect(result).toContain(monthlyBudget);
            expect(result).not.toContain(futureMonthlyBudget);
        });

        it('should include budgets starting on the exact date', () => {
             const result = filterBudgetsByMode([monthlyBudget], 'monthly', mode, jan1);
             expect(result).toContain(monthlyBudget);
        });

        it('should include budgets started in the past', () => {
             const result = filterBudgetsByMode([monthlyBudget], 'monthly', mode, jun1);
             expect(result).toContain(monthlyBudget);
        });

        it('should exclude custom budgets that have ended', () => {
             // Project ends Jun 30. Check on Dec 1.
             const result = filterBudgetsByMode([projectBudget], 'custom', mode, dec1);
             expect(result).not.toContain(projectBudget);
        });

        it('should include custom budgets active on date', () => {
             // Project ends Jun 30. Check on Jun 1.
             const result = filterBudgetsByMode([projectBudget], 'custom', mode, jun1);
             expect(result).toContain(projectBudget);
        });
    });

    describe('Period/Type Logic', () => {
        it('should only return custom budgets when type is "custom"', () => {
            const all = [monthlyBudget, yearlyBudget, projectBudget];
            const result = filterBudgetsByMode(all, 'custom', mode, jan1);
            expect(result).toHaveLength(1);
            expect(result[0]).toBe(projectBudget);
        });

        it('should only return monthly budgets when type is "monthly"', () => {
            const all = [monthlyBudget, yearlyBudget, projectBudget];
            const result = filterBudgetsByMode(all, 'monthly', mode, jan1);
            expect(result).toHaveLength(1);
            expect(result[0]).toBe(monthlyBudget);
        });

        it('should only return yearly budgets when type is "yearly"', () => {
             const all = [monthlyBudget, yearlyBudget, projectBudget];
             const result = filterBudgetsByMode(all, 'yearly', mode, jan1);
            expect(result).toHaveLength(1);
            expect(result[0]).toBe(yearlyBudget);
        });
    });
});
