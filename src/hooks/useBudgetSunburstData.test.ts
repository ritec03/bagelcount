import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { BudgetAllocation } from '../lib/types';
import type { Transaction } from '../lib/api/types.gen';
import { useBudgetSunburstData } from './useBudgetSunburstData';

describe('useBudgetSunburstData', () => {
  // Test Strategy: ZOMBIES - (Z) Zero cases
  describe('Zero cases', () => {
    it('should return empty category node for empty budgets array', () => {
      // Arrange
      const budgets: BudgetAllocation[] = [];
      const transactions: Transaction[] = [];

      // Act
      const { result } = renderHook(() => useBudgetSunburstData(budgets, transactions));

      // Assert
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data.type).toBe('category');
      expect(result.current.data.name).toBe('Budget');
      expect(result.current.data.children).toEqual([]);
    });

    it('should handle empty transactions array', () => {
      // Arrange
      const budgets: BudgetAllocation[] = [{
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly'
      }];
      const transactions: Transaction[] = [];

      // Act
      const { result } = renderHook(() => useBudgetSunburstData(budgets, transactions));

      // Assert
      expect(result.current.data.type).toBe('category');
      const children = result.current.data.children || [];
      expect(children.length).toBeGreaterThan(0);
    });
  });

  // Test Strategy: ZOMBIES - (O) One case
  describe('One case', () => {
    it('should create budget node for single budget with no transactions', () => {
      // Arrange
      const budgets: BudgetAllocation[] = [{
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly'
      }];
      const transactions: Transaction[] = [];

      // Act
      const { result } = renderHook(() => useBudgetSunburstData(budgets, transactions));

      // Assert
      const root = result.current.data;
      expect(root.type).toBe('category');
      
      // Navigate tree: Budget -> Expenses (category) -> Food (budget node)
      const expensesNode = root.children?.find(c => c.name === 'Expenses');
      expect(expensesNode).toBeDefined();
      
      if (expensesNode && expensesNode.children) {
        const foodNode = expensesNode.children.find(c => c.name === 'Food');
        expect(foodNode).toBeDefined();
        
        if (foodNode && foodNode.type === 'budget') {
          expect(foodNode.budgeted).toBe(500);
          expect(foodNode.spent).toBe(0);
          expect(foodNode.fullPath).toBe('Expenses:Food');
        }
      }
    });

    it('should calculate spent from single matching transaction', () => {
      // Arrange
      const budgets: BudgetAllocation[] = [{
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly'
      }];
      
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      
      const transactions: Transaction[] = [{
        date: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-15`,
        narration: 'Grocery shopping',
        postings: [{
          account: 'Expenses:Food',
          units: '50.00 CAD',
          currency: 'CAD'
        }]
      }];

      // Act
      const { result } = renderHook(() => useBudgetSunburstData(budgets, transactions));

      // Assert
      const expensesNode = result.current.data.children?.find(c => c.name === 'Expenses');
      const foodNode = expensesNode?.children?.find(c => c.name === 'Food');
      
      if (foodNode && foodNode.type === 'budget') {
        expect(foodNode.spent).toBe(50);
      }
    });
  });

  // Test Strategy: ZOMBIES - (M) Many cases
  describe('Many cases', () => {
    it('should handle multiple budgets with hierarchy', () => {
      // Arrange
      const budgets: BudgetAllocation[] = [
        {
          account: 'Expenses:Food',
          amount: '1000.00',
          currency: 'CAD',
          start_date: '2026-01-01',
          frequency: 'monthly'
        },
        {
          account: 'Expenses:Food:Groceries',
          amount: '600.00',
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
      const transactions: Transaction[] = [];

      // Act
      const { result } = renderHook(() => useBudgetSunburstData(budgets, transactions));

      // Assert
      const expensesNode = result.current.data.children?.find(c => c.name === 'Expenses');
      expect(expensesNode).toBeDefined();
      
      if (expensesNode) {
        const foodNode = expensesNode.children?.find(c => c.name === 'Food');
        const transportNode = expensesNode.children?.find(c => c.name === 'Transport');
        
        expect(foodNode).toBeDefined();
        expect(transportNode).toBeDefined();
        
        // Food should have Groceries child
        if (foodNode && foodNode.type === 'budget') {
          const groceriesNode = foodNode.children?.find(c => c.name === 'Groceries');
          expect(groceriesNode).toBeDefined();
        }
      }
    });

    it('should aggregate multiple transactions', () => {
      // Arrange
      const budgets: BudgetAllocation[] = [{
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly'
      }];
      
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      
      const transactions: Transaction[] = [
        {
          date: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-10`,
          narration: 'Grocery',
          postings: [{
            account: 'Expenses:Food',
            units: '50.00 CAD',
            currency: 'CAD'
          }]
        },
        {
          date: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-20`,
          narration: 'Restaurant',
          postings: [{
            account: 'Expenses:Food',
            units: '75.50 CAD',
            currency: 'CAD'
          }]
        }
      ];

      // Act
      const { result } = renderHook(() => useBudgetSunburstData(budgets, transactions));

      // Assert
      const expensesNode = result.current.data.children?.find(c => c.name === 'Expenses');
      const foodNode = expensesNode?.children?.find(c => c.name === 'Food');
      
      if (foodNode && foodNode.type === 'budget') {
        expect(foodNode.spent).toBe(125.50);
      }
    });
  });

  // Test Strategy: ZOMBIES - (B) Boundary cases
  describe('Boundary cases', () => {
    it('should create spacer node when remainder budget exists', () => {
      // Arrange
      const budgets: BudgetAllocation[] = [
        {
          account: 'Expenses:Food',
          amount: '1000.00',
          currency: 'CAD',
          start_date: '2026-01-01',
          frequency: 'monthly'
        },
        {
          account: 'Expenses:Food:Groceries',
          amount: '600.00',
          currency: 'CAD',
          start_date: '2026-01-01',
          frequency: 'monthly'
        }
      ];
      const transactions: Transaction[] = [];

      // Act
      const { result } = renderHook(() => useBudgetSunburstData(budgets, transactions));

      // Assert
      const expensesNode = result.current.data.children?.find(c => c.name === 'Expenses');
      const foodNode = expensesNode?.children?.find(c => c.name === 'Food');
      
      if (foodNode && foodNode.type === 'budget') {
        const spacerNode = foodNode.children?.find(c => c.type === 'spacer');
        expect(spacerNode).toBeDefined();
        
        if (spacerNode && spacerNode.type === 'spacer') {
          expect(spacerNode.value).toBe(400); // 1000 - 600
          expect(spacerNode.color).toBe('transparent');
        }
      }
    });

    it('should not create spacer node when remainder is zero', () => {
      // Arrange
      const budgets: BudgetAllocation[] = [
        {
          account: 'Expenses:Food',
          amount: '1000.00',
          currency: 'CAD',
          start_date: '2026-01-01',
          frequency: 'monthly'
        },
        {
          account: 'Expenses:Food:Groceries',
          amount: '600.00',
          currency: 'CAD',
          start_date: '2026-01-01',
          frequency: 'monthly'
        },
        {
          account: 'Expenses:Food:Restaurants',
          amount: '400.00',
          currency: 'CAD',
          start_date: '2026-01-01',
          frequency: 'monthly'
        }
      ];
      const transactions: Transaction[] = [];

      // Act
      const { result } = renderHook(() => useBudgetSunburstData(budgets, transactions));

      // Assert
      const expensesNode = result.current.data.children?.find(c => c.name === 'Expenses');
      const foodNode = expensesNode?.children?.find(c => c.name === 'Food');
      
      if (foodNode && foodNode.type === 'budget') {
        const spacerNode = foodNode.children?.find(c => c.type === 'spacer');
        expect(spacerNode).toBeUndefined();
      }
    });

    it('should handle over-allocation when children exceed parent budget', () => {
      // Arrange - children ($600 + $500 = $1100) exceed parent ($1000)
      const budgets: BudgetAllocation[] = [
        {
          account: 'Expenses:Food',
          amount: '1000.00',
          currency: 'CAD',
          start_date: '2026-01-01',
          frequency: 'monthly'
        },
        {
          account: 'Expenses:Food:Groceries',
          amount: '600.00',
          currency: 'CAD',
          start_date: '2026-01-01',
          frequency: 'monthly'
        },
        {
          account: 'Expenses:Food:Restaurants',
          amount: '500.00',
          currency: 'CAD',
          start_date: '2026-01-01',
          frequency: 'monthly'
        }
      ];
      const transactions: Transaction[] = [];

      // Act
      const { result } = renderHook(() => useBudgetSunburstData(budgets, transactions));

      // Assert - totalBudget should show actual allocation (1100), not parent budget (1000)
      const expensesNode = result.current.data.children?.find(c => c.name === 'Expenses');
      const foodNode = expensesNode?.children?.find(c => c.name === 'Food');
      
      if (foodNode && foodNode.type === 'budget') {
        // No spacer should exist (over-allocated, no remainder)
        const spacerNode = foodNode.children?.find(c => c.type === 'spacer');
        expect(spacerNode).toBeUndefined();
      }

      // The parent category should show the actual total allocation
      if (expensesNode && expensesNode.type === 'category') {
        expect(expensesNode.totalBudget).toBe(1100); // Sum of children, not parent's 1000
      }
    });
  });

  // Test Strategy: Hierarchical spending (account + children)
  describe('Hierarchical spending', () => {
    it('should match child account transactions to parent budget', () => {
      // Arrange
      const budgets: BudgetAllocation[] = [{
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly'
      }];
      
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      
      const transactions: Transaction[] = [{
        date: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-15`,
        narration: 'Restaurant',
        postings: [{
          account: 'Expenses:Food:Restaurants',
          units: '50.00 CAD',
          currency: 'CAD'
        }]
      }];

      // Act
      const { result } = renderHook(() => useBudgetSunburstData(budgets, transactions));

      // Assert
      const expensesNode = result.current.data.children?.find(c => c.name === 'Expenses');
      const foodNode = expensesNode?.children?.find(c => c.name === 'Food');
      
      if (foodNode && foodNode.type === 'budget') {
        expect(foodNode.spent).toBe(50);
      }
    });
  });

  // Test Strategy: Color assignment
  describe('Color assignment', () => {
    it('should assign distinct colors to top-level categories', () => {
      // Arrange
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
      const transactions: Transaction[] = [];

      // Act
      const { result } = renderHook(() => useBudgetSunburstData(budgets, transactions));

      // Assert
      const expensesNode = result.current.data.children?.find(c => c.name === 'Expenses');
      
      if (expensesNode) {
        const foodNode = expensesNode.children?.find(c => c.name === 'Food');
        const transportNode = expensesNode.children?.find(c => c.name === 'Transport');
        
        expect(foodNode?.color).toBeDefined();
        expect(transportNode?.color).toBeDefined();
        // Colors should be different
        expect(foodNode?.color).not.toBe(transportNode?.color);
      }
    });
  });

  // Test Strategy: Memoization
  describe('Memoization', () => {
    it('should memoize result when inputs unchanged', () => {
      // Arrange
      const budgets: BudgetAllocation[] = [{
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly'
      }];
      const transactions: Transaction[] = [];

      // Act
      const { result, rerender } = renderHook(() => useBudgetSunburstData(budgets, transactions));
      const firstResult = result.current.data;
      
      rerender();
      const secondResult = result.current.data;

      // Assert - should be same object reference
      expect(firstResult).toBe(secondResult);
    });

    it('should recalculate when budgets change', () => {
      // Arrange
      let budgets: BudgetAllocation[] = [{
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly'
      }];
      const transactions: Transaction[] = [];

      // Act
      const { result, rerender } = renderHook(
        ({ b }) => useBudgetSunburstData(b, transactions),
        { initialProps: { b: budgets } }
      );
      const firstResult = result.current.data;
      
      // Change budgets
      budgets = [
        ...budgets,
        {
          account: 'Expenses:Transport',
          amount: '300.00',
          currency: 'CAD',
          start_date: '2026-01-01',
          frequency: 'monthly'
        }
      ];
      
      rerender({ b: budgets });
      const secondResult = result.current.data;

      // Assert - should be different object reference
      expect(firstResult).not.toBe(secondResult);
    });

    it('should recalculate when transactions change', () => {
      // Arrange
      const budgets: BudgetAllocation[] = [{
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly'
      }];
      
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      
      let transactions: Transaction[] = [];

      // Act
      const { result, rerender } = renderHook(
        ({ t }) => useBudgetSunburstData(budgets, t),
        { initialProps: { t: transactions } }
      );
      const firstResult = result.current.data;
      
      // Add transaction
      transactions = [{
        date: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-15`,
        narration: 'Grocery',
        postings: [{
          account: 'Expenses:Food',
          units: '50.00 CAD',
          currency: 'CAD'
        }]
      }];
      
      rerender({ t: transactions });
      const secondResult = result.current.data;

      // Assert - should be different object reference
      expect(firstResult).not.toBe(secondResult);
    });
  });

  // Test Strategy: ZOMBIES - (I) Interface
  describe('Interface', () => {
    it('should return correct interface structure', () => {
      // Arrange
      const budgets: BudgetAllocation[] = [];
      const transactions: Transaction[] = [];

      // Act
      const { result } = renderHook(() => useBudgetSunburstData(budgets, transactions));

      // Assert
      expect(result.current).toHaveProperty('data');
      expect(result.current).toHaveProperty('isLoading');
      expect(typeof result.current.isLoading).toBe('boolean');
      expect(result.current.data).toHaveProperty('type');
      expect(result.current.data.type).toBe('category');
    });
  });
});
