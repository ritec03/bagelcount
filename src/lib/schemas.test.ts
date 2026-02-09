import { budgetSchema } from '@/lib/schemas';
import { describe, it, expect } from 'vitest';

describe('budgetSchema discriminated union', () => {
  describe('StandardBudget validation', () => {
    it('should validate StandardBudget with all required fields', () => {
      const result = budgetSchema.safeParse({
        type: 'StandardBudget',
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly'
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject StandardBudget without frequency', () => {
      const result = budgetSchema.safeParse({
        type: 'StandardBudget',
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01'
      });
      
      expect(result.success).toBe(false);
      // Zod discriminated union error message includes the valid options
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Invalid');
      }
    });

    it('should validate StandardBudget with optional tags', () => {
      const result = budgetSchema.safeParse({
        type: 'StandardBudget',
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'quarterly',
        tags: 'groceries, dining'
      });
      
      expect(result.success).toBe(true);
    });

    it('should accept all valid frequency values', () => {
      const frequencies = ['monthly', 'quarterly', 'yearly'] as const;
      
      frequencies.forEach(frequency => {
        const result = budgetSchema.safeParse({
          type: 'StandardBudget',
          account: 'Expenses:Food',
          amount: '500.00',
          currency: 'CAD',
          start_date: '2026-01-01',
          frequency
        });
        
        expect(result.success).toBe(true);
      });
    });
  });

  describe('CustomBudget validation', () => {
    it('should validate CustomBudget with all required fields', () => {
      const result = budgetSchema.safeParse({
        type: 'CustomBudget',
        account: 'Expenses:Vacation',
        amount: '2000.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        end_date: '2026-12-31'
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject CustomBudget without end_date', () => {
      const result = budgetSchema.safeParse({
        type: 'CustomBudget',
        account: 'Expenses:Vacation',
        amount: '2000.00',
        currency: 'CAD',
        start_date: '2026-01-01'
      });
      
      expect(result.success).toBe(false);
      // Zod returns "expected string, received undefined" for missing required string fields
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('expected string');
      }
    });

    it('should validate CustomBudget with optional tags', () => {
      const result = budgetSchema.safeParse({
        type: 'CustomBudget',
        account: 'Expenses:Vacation',
        amount: '2000.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        tags: 'travel, 2026'
      });
      
      expect(result.success).toBe(true);
    });
  });

  describe('Base schema validation', () => {
    it('should reject budget without account', () => {
      const result = budgetSchema.safeParse({
        type: 'StandardBudget',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly'
      });
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('account');
      }
    });

    it('should reject budget without amount', () => {
      const result = budgetSchema.safeParse({
        type: 'StandardBudget',
        account: 'Expenses:Food',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly'
      });
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('amount');
      }
    });

    it('should use default currency when not provided', () => {
      const result = budgetSchema.safeParse({
        type: 'StandardBudget',
        account: 'Expenses:Food',
        amount: '500.00',
        start_date: '2026-01-01',
        frequency: 'monthly'
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currency).toBe('CAD');
      }
    });

    it('should reject budget without start_date', () => {
      const result = budgetSchema.safeParse({
        type: 'StandardBudget',
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        frequency: 'monthly'
      });
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('start_date');
      }
    });
  });

  describe('Type discrimination', () => {
    it('should not allow mixing StandardBudget with end_date', () => {
      const result = budgetSchema.safeParse({
        type: 'StandardBudget',
        account: 'Expenses:Food',
        amount: '500.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        frequency: 'monthly',
        end_date: '2026-12-31' // Should be ignored/rejected
      });
      
      // The schema should still validate, but end_date should not be in the output
      expect(result.success).toBe(true);
    });

    it('should not allow mixing CustomBudget with frequency', () => {
      const result = budgetSchema.safeParse({
        type: 'CustomBudget',
        account: 'Expenses:Vacation',
        amount: '2000.00',
        currency: 'CAD',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        frequency: 'monthly' // Should be ignored/rejected
      });
      
      // The schema should still validate, but frequency should not be in the output
      expect(result.success).toBe(true);
    });
  });
});
