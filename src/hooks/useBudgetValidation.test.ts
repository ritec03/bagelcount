import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBudgetValidation } from './useBudgetValidation';
import type { StandardBudgetOutput } from '../lib/types';

describe('useBudgetValidation', () => {
  it('should return valid for non-StandardBudget types', () => {
    const { result } = renderHook(() => 
      useBudgetValidation([], 'Expenses:Food', 500, 'CustomBudget')
    );
    expect(result.current.isValid).toBe(true);
    expect(result.current.message).toBe(null);
  });

  it('should return valid when no budgets exist', () => {
    const { result } = renderHook(() => 
      useBudgetValidation(undefined, 'Expenses:Food', 500, 'StandardBudget')
    );
    expect(result.current.isValid).toBe(true);
  });

  it('should detect parent budget exceeded by child', () => {
    const budgets: StandardBudgetOutput[] = [
      { account: 'Expenses:Food', amount: '1000', frequency: 'monthly', currency: 'CAD', start_date: '2026-01-01', tags: [] },
      { account: 'Expenses:Food:Groceries', amount: '600', frequency: 'monthly', currency: 'CAD', start_date: '2026-01-01', tags: [] }
    ];
    
    const { result } = renderHook(() => 
      useBudgetValidation(budgets, 'Expenses:Food:DiningOut', 500, 'StandardBudget')
    );
    
    expect(result.current.isValid).toBe(false);
    expect(result.current.message).toContain('Exceeds parent budget');
    expect(result.current.availableBudget).toBe(400);
  });

  it('should detect insufficient parent for children', () => {
    const budgets: StandardBudgetOutput[] = [
      { account: 'Expenses:Food:Groceries', amount: '600', frequency: 'monthly', currency: 'CAD', start_date: '2026-01-01', tags: [] },
      { account: 'Expenses:Food:DiningOut', amount: '400', frequency: 'monthly', currency: 'CAD', start_date: '2026-01-01', tags: [] }
    ];
    
    const { result } = renderHook(() => 
      useBudgetValidation(budgets, 'Expenses:Food', 800, 'StandardBudget')
    );
    
    expect(result.current.isValid).toBe(false);
    expect(result.current.message).toContain('Insufficient for sub-categories');
  });

  it('should allow valid child budget within parent limit', () => {
    const budgets: StandardBudgetOutput[] = [
      { account: 'Expenses:Food', amount: '1000', frequency: 'monthly', currency: 'CAD', start_date: '2026-01-01', tags: [] },
      { account: 'Expenses:Food:Groceries', amount: '600', frequency: 'monthly', currency: 'CAD', start_date: '2026-01-01', tags: [] }
    ];
    
    const { result } = renderHook(() => 
      useBudgetValidation(budgets, 'Expenses:Food:DiningOut', 300, 'StandardBudget')
    );
    
    expect(result.current.isValid).toBe(true);
    expect(result.current.availableBudget).toBe(400);
  });

  it('should allow parent budget sufficient for all children', () => {
    const budgets: StandardBudgetOutput[] = [
      { account: 'Expenses:Food:Groceries', amount: '400', frequency: 'monthly', currency: 'CAD', start_date: '2026-01-01', tags: [] },
      { account: 'Expenses:Food:DiningOut', amount: '300', frequency: 'monthly', currency: 'CAD', start_date: '2026-01-01', tags: [] }
    ];
    
    const { result } = renderHook(() => 
      useBudgetValidation(budgets, 'Expenses:Food', 1000, 'StandardBudget')
    );
    
    expect(result.current.isValid).toBe(true);
  });

  it('should handle accounts without parent', () => {
    const budgets: StandardBudgetOutput[] = [
      { account: 'Income', amount: '5000', frequency: 'monthly', currency: 'CAD', start_date: '2026-01-01', tags: [] }
    ];
    
    const { result } = renderHook(() => 
      useBudgetValidation(budgets, 'Expenses', 2000, 'StandardBudget')
    );
    
    expect(result.current.isValid).toBe(true);
  });
});
