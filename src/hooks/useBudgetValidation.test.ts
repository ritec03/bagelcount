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
    expect(result.current.error).toBe(null);
  });

  it('should return valid when no budgets exist', () => {
    const { result } = renderHook(() => 
      useBudgetValidation(undefined, 'Expenses:Food', 500, 'StandardBudget', 'monthly')
    );
    expect(result.current.isValid).toBe(true);
  });

  it('should detect parent budget exceeded by child', () => {
    const budgets: StandardBudgetOutput[] = [
      { account: 'Expenses:Food', amount: '1000', frequency: 'monthly', currency: 'CAD', start_date: '2026-01-01', tags: [] },
      { account: 'Expenses:Food:Groceries', amount: '600', frequency: 'monthly', currency: 'CAD', start_date: '2026-01-01', tags: [] }
    ];
    
    const { result } = renderHook(() => 
      useBudgetValidation(budgets, 'Expenses:Food:DiningOut', 500, 'StandardBudget', 'monthly')
    );
    
    expect(result.current.isValid).toBe(false);
    expect(result.current.error).toContain('Exceeds parent budget');
    expect(result.current.availableBudget).toBe(400);
  });

  it('should detect insufficient parent for children (WARNING only)', () => {
    const budgets: StandardBudgetOutput[] = [
      { account: 'Expenses:Food:Groceries', amount: '600', frequency: 'monthly', currency: 'CAD', start_date: '2026-01-01', tags: [] },
      { account: 'Expenses:Food:DiningOut', amount: '400', frequency: 'monthly', currency: 'CAD', start_date: '2026-01-01', tags: [] }
    ];
    
    const { result } = renderHook(() => 
      useBudgetValidation(budgets, 'Expenses:Food', 800, 'StandardBudget', 'monthly')
    );
    
    // Changed behavior: Insufficient for children is a WARNING, not invalid
    expect(result.current.isValid).toBe(true);
    expect(result.current.warnings).toHaveLength(1);
    expect(result.current.warnings[0]).toContain('Sub-categories total');
  });

  it('should allow valid child budget within parent limit', () => {
    const budgets: StandardBudgetOutput[] = [
      { account: 'Expenses:Food', amount: '1000', frequency: 'monthly', currency: 'CAD', start_date: '2026-01-01', tags: [] },
      { account: 'Expenses:Food:Groceries', amount: '600', frequency: 'monthly', currency: 'CAD', start_date: '2026-01-01', tags: [] }
    ];
    
    const { result } = renderHook(() => 
      useBudgetValidation(budgets, 'Expenses:Food:DiningOut', 300, 'StandardBudget', 'monthly')
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
      useBudgetValidation(budgets, 'Expenses:Food', 1000, 'StandardBudget', 'monthly')
    );
    
    expect(result.current.isValid).toBe(true);
    expect(result.current.warnings).toHaveLength(0);
  });

  it('should handle accounts without parent', () => {
    const budgets: StandardBudgetOutput[] = [
      { account: 'Income', amount: '5000', frequency: 'monthly', currency: 'CAD', start_date: '2026-01-01', tags: [] }
    ];
    
    const { result } = renderHook(() => 
      useBudgetValidation(budgets, 'Expenses', 2000, 'StandardBudget', 'monthly')
    );
    
    expect(result.current.isValid).toBe(true);
  });
});

describe('useBudgetValidation (TDD Spec)', () => {
    // Helper to create budgets easily
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

    describe('Parent Validation (Blocking Rules)', () => {
        it('should ALLOW Monthly child fitting into Yearly parent', () => {
            // Parent: $12,000 / year
            const budgets = [createBudget('Expenses:Food', '12000', 'yearly')];
            
            // Child: $500 / month ($6,000 / year) -> Valid
            const { result } = renderHook(() => 
                useBudgetValidation(budgets, 'Expenses:Food:Restaurants', 500, 'StandardBudget', 'monthly')
            );

            expect(result.current.isValid).toBe(true);
            expect(result.current.error).toBeNull();
        });

        it('should BLOCK Monthly child exceeding Yearly parent', () => {
            // Parent: $12,000 / year
            const budgets = [createBudget('Expenses:Food', '12000', 'yearly')];
            
            // Child: $1,500 / month ($18,000 / year) -> Invalid
            const { result } = renderHook(() => 
                useBudgetValidation(budgets, 'Expenses:Food:Restaurants', 1500, 'StandardBudget', 'monthly')
            );

            expect(result.current.isValid).toBe(false);
            expect(result.current.error).toContain('Exceeds parent budget');
        });

        it('should ALLOW Yearly child fitting into Monthly parent', () => {
            // Parent: $1,000 / month ($12,000 / year)
            const budgets = [createBudget('Expenses:Food', '1000', 'monthly')];
            
            // Child: $10,000 / year -> Valid
            const { result } = renderHook(() => 
                useBudgetValidation(budgets, 'Expenses:Food:Travel', 10000, 'StandardBudget', 'yearly')
            );

            expect(result.current.isValid).toBe(true);
        });

        it('should WARN (not block) Yearly child exceeding Monthly parent', () => {
             // Parent: $1,000 / month ($12,000 / year) — higher frequency
             const budgets = [createBudget('Expenses:Food', '1000', 'monthly')];
             
             // Child: $15,000 / year → exceeds monthly parent's annual equivalent
             // Directional rule: monthly parent does NOT block yearly child, only warns
             const { result } = renderHook(() => 
                 useBudgetValidation(budgets, 'Expenses:Food:Travel', 15000, 'StandardBudget', 'yearly')
             );
 
             expect(result.current.isValid).toBe(true);
             expect(result.current.error).toBeNull();
             expect(result.current.warnings.length).toBeGreaterThanOrEqual(1);
        });

        it('should account for siblings with mixed frequencies', () => {
            // Parent: $12,000 / year
            // Sibling 1: $500 / month ($6,000 / year)
            const budgets = [
                createBudget('Expenses:Food', '12000', 'yearly'),
                createBudget('Expenses:Food:Groceries', '500', 'monthly')
            ];

            // New Child: $7,000 / year
            // Total Used: $6,000 + $7,000 = $13,000 > $12,000 -> Invalid
            const { result } = renderHook(() => 
                useBudgetValidation(budgets, 'Expenses:Food:Restaurants', 7000, 'StandardBudget', 'yearly')
            );

            expect(result.current.isValid).toBe(false);
            expect(result.current.availableBudget).toBeCloseTo(6000); // 12000 - 6000
        });
    });

    describe('Child Validation (Warning Rules)', () => {
        it('should WARN if new Parent budget is too small for existing Children', () => {
            // Existing Child: $500 / month ($6,000 / year)
            const budgets = [createBudget('Expenses:Food:Restaurants', '500', 'monthly')];

            // New Parent: $4,000 / year
            // This is valid (doesn't block creation), but generates warnings
            const { result } = renderHook(() => 
                useBudgetValidation(budgets, 'Expenses:Food', 4000, 'StandardBudget', 'yearly')
            );

            expect(result.current.isValid).toBe(true); // NOT blocking
            expect(result.current.warnings).toHaveLength(1);
            // Warning should verify specific child
            expect(result.current.affectedChildren).toContainEqual(
                expect.objectContaining({ account: 'Expenses:Food:Restaurants' })
            );
            expect(result.current.warnings[0]).toContain('Sub-categories total $6000.00/yr');
        });

        it('should verify Same-Account Hierarchy (Monthly exists, masks Children)', () => {
             // Setup: Food:Monthly ($500), Food:Groceries:Yearly ($1000)
             // Food:Monthly ($6000/yr) covers Food:Groceries ($1000/yr).
             // New Budget: Food:Yearly 
             // Requirement: Must cover Food:Monthly ($6000). Should IGNORE Groceries.
             const budgets = [
                 createBudget('Expenses:Food', '500', 'monthly'),
                 createBudget('Expenses:Food:Groceries', '1000', 'yearly')
             ];
 
             // 1. Valid: Cover Monthly ($6000)
             const validHook = renderHook(() => 
                 useBudgetValidation(budgets, 'Expenses:Food', 6000, 'StandardBudget', 'yearly')
             );
             expect(validHook.result.current.isValid).toBe(true);
             expect(validHook.result.current.warnings).toHaveLength(0);

             // 2. Invalid: Less than Monthly ($5000 < 6000)
             const invalidHook = renderHook(() => 
                 useBudgetValidation(budgets, 'Expenses:Food', 5000, 'StandardBudget', 'yearly')
             );
             expect(invalidHook.result.current.warnings).toHaveLength(1);
             expect(invalidHook.result.current.warnings[0]).toContain('monthly budget for this account totals $6000.00/yr');
        });

        it('should BLOCK Child if it violates ANY of multiple Parents (Monthly OK but Yearly Exceeded)', () => {
            // Parent 1: Food:Monthly ($500) -> $6000/yr
            // Parent 2: Food:Yearly ($1000) -> $1000/yr
            // Child: Food:Groceries ($200/mo) -> $2400/yr available
            
            // Matches Monthly ($2400 < 6000)
            // Violates Yearly ($2400 > 1000)
            // Should be INVALID.
            const budgets = [
                createBudget('Expenses:Food', '500', 'monthly'),
                createBudget('Expenses:Food', '1000', 'yearly')
            ];

            const { result } = renderHook(() => 
                useBudgetValidation(budgets, 'Expenses:Food:Groceries', 200, 'StandardBudget', 'monthly')
            );

            expect(result.current.error).toContain('Exceeds parent budget');
       });

       it('should BLOCK if Same-Account Consistency is violated (Yearly 1000 vs Monthly 500)', () => {
           // Account: Food
           // Budget 1: Yearly $1000
           // Budget 2: Monthly $500 ($6000/yr) -> CONFLICT
           const budgets = [
               createBudget('Expenses:Food', '1000', 'yearly')
           ];
           const { result } = renderHook(() => 
               useBudgetValidation(budgets, 'Expenses:Food', 500, 'StandardBudget', 'monthly')
           );
           expect(result.current.isValid).toBe(false);
           expect(result.current.error).toContain('Exceeds budget set by other period');
       });


        it('should verify specific 2700 vs 600 scenario (Monthly Children vs Yearly Parent)', () => {
             // Children: Coffee ($100/mo) + Restaurants ($125/mo) = $225/mo
             // Annualized Need = $225 * 12 = $2700
             const budgets = [
                 createBudget('Expenses:Food:Coffee', '100', 'monthly'),
                 createBudget('Expenses:Food:Restaurants', '125', 'monthly')
             ];
 
             // Parent: Food ($600/year)
             // Shortfall = $2700 - $600 = $2100
             const { result } = renderHook(() => 
                 useBudgetValidation(budgets, 'Expenses:Food', 600, 'StandardBudget', 'yearly')
             );
 
             expect(result.current.isValid).toBe(true);
             expect(result.current.warnings).toHaveLength(1);
             expect(result.current.warnings[0]).toContain('Sub-categories total $2700.00/yr');
             expect(result.current.warnings[0]).toContain('additional $2100.00/yearly');
        });

        it('should NOT warn if new Parent budget covers existing Children', () => {
             // Existing Child: $500 / month ($6,000 / year)
             const budgets = [createBudget('Expenses:Food:Restaurants', '500', 'monthly')];
 
             // New Parent: $7,000 / year
             const { result } = renderHook(() => 
                 useBudgetValidation(budgets, 'Expenses:Food', 7000, 'StandardBudget', 'yearly')
             );
 
             expect(result.current.isValid).toBe(true);
             expect(result.current.warnings).toHaveLength(0);
        });

        it('should aggregate multiple children frequencies for warning', () => {
            // Child 1: $100 / month ($1,200/yr)
            // Child 2: $2,000 / year
            const budgets = [
                createBudget('Expenses:Food:A', '100', 'monthly'),
                createBudget('Expenses:Food:B', '2000', 'yearly')
            ];

            // Parent: $3,000 / year -> Too small (Needs $3,200)
            const { result } = renderHook(() => 
                useBudgetValidation(budgets, 'Expenses:Food', 3000, 'StandardBudget', 'yearly')
            );

            expect(result.current.isValid).toBe(true);
            expect(result.current.warnings).toHaveLength(1); // Should probably group into one warning or list affected
            expect(result.current.affectedChildren).toContainEqual(
                expect.objectContaining({ account: 'Expenses:Food:A' })
            );
            expect(result.current.affectedChildren).toContainEqual(
                expect.objectContaining({ account: 'Expenses:Food:B' })
            );
        });
    });
});

describe('useBudgetValidation Reproduction', () => {
  it('should allow yearly budget that fits within monthly parent budget', () => {
    // Parent: Expenses:Food = $500/month (~$6000/year)
    const budgets: StandardBudgetOutput[] = [
      { 
        account: 'Expenses:Food', 
        amount: '500', 
        frequency: 'monthly', 
        currency: 'CAD', 
        start_date: '2026-01-01', 
        tags: [] 
      }
    ];
    
    // Child: Expenses:Food:Restaurants = $5000/year (~$416/month)
    // This should be VALID because 416 < 500
    const { result } = renderHook(() => 
      useBudgetValidation(
        budgets, 
        'Expenses:Food:Restaurants', 
        5000, 
        'StandardBudget',
        'yearly' // We need to be able to pass the frequency of the new budget!
        // WAIT: The useBudgetValidation hook signature does NOT accept frequency currently!
        // We need to update the hook signature to accept frequency.
      )
    );
    
    // CURRENT LOGIC: 5000 > 500 -> Invalid
    // EXPECTED: Valid
    expect(result.current.isValid).toBe(true);
  });
});

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

describe('Red Team: useBudgetValidation Edge Cases', () => {
    it('should WARN when parent amount is zero but children exist (zero-amount bypass)', () => {
        // Arrange
        // Per Rule C: ParentAnnual >= Sum(ChildAnnualNeeds)
        // A $0 parent with a $500/mo child ($6000/yr) should produce a warning.
        const budgets = [createBudget('Expenses:Food:Groceries', '500', 'monthly')];

        // Act
        const { result } = renderHook(() =>
            useBudgetValidation(budgets, 'Expenses:Food', 0, 'StandardBudget', 'yearly')
        );

        // Assert
        // Bug: `!amount` at line 45 is true when amount===0, causing early exit
        // with isValid=true and empty warnings. The child check never runs.
        expect(result.current.isValid).toBe(true);        // Warnings are non-blocking
        expect(result.current.warnings).toHaveLength(1);   // But should still warn
        expect(result.current.warnings[0]).toContain('Sub-categories total $6000.00/yr');
    });

    it('should reject negative budget amounts as invalid', () => {
        // Arrange
        // No domain rule allows negative budget amounts.
        // A negative amount should be caught as an error.
        const budgets = [createBudget('Expenses:Food', '1000', 'yearly')];

        // Act
        const { result } = renderHook(() =>
            useBudgetValidation(budgets, 'Expenses:Food:Groceries', -500, 'StandardBudget', 'monthly')
        );

        // Assert
        // Bug: -500 is truthy, so the guard passes. myAnnualAmount = -6000.
        // -6000 < 1000 (parent annual), so parent check passes.
        // The negative budget is silently accepted as valid.
        expect(result.current.isValid).toBe(false);
    });

    it('should not double-count self as sibling when budget is already in the list', () => {
        // Arrange
        // This simulates the BudgetList pattern where each existing budget
        // validates against the full budgets array (which includes itself).
        //
        // Parent: Food = $1000/mo ($12000/yr)
        // Sibling: DiningOut = $300/mo ($3600/yr)
        // Self: Groceries = $400/mo ($4800/yr) — already in the list
        //
        // Expected Available = $12000 - $3600 (DiningOut only) = $8400/yr → $700/mo
        // Groceries ($4800/yr) < $8400/yr → Valid, available = $700
        const budgets = [
            createBudget('Expenses:Food', '1000', 'monthly'),
            createBudget('Expenses:Food:Groceries', '400', 'monthly'),
            createBudget('Expenses:Food:DiningOut', '300', 'monthly'),
        ];

        // Act
        const { result } = renderHook(() =>
            useBudgetValidation(budgets, 'Expenses:Food:Groceries', 400, 'StandardBudget', 'monthly')
        );

        // Assert
        // The filter at line 102 uses `b.account !== account`, which correctly
        // excludes self by name. But this test codifies the expectation so that
        // future changes don't regress.
        expect(result.current.isValid).toBe(true);
        expect(result.current.error).toBeNull();
        expect(result.current.availableBudget).toBe(700);
    });

    it('should return affectedChildren as typed objects with account and frequency', () => {
        // Arrange
        // Parent budget is too small for children → should produce warnings with structured affectedChildren
        const budgets = [
            createBudget('Expenses:Food:Groceries', '500', 'monthly'),
            createBudget('Expenses:Food:DiningOut', '200', 'quarterly'),
        ];

        // Act
        // Parent: $1000/yr, children need $500*12 + $200*4 = $6800/yr → insufficient
        const { result } = renderHook(() =>
            useBudgetValidation(budgets, 'Expenses:Food', 1000, 'StandardBudget', 'yearly')
        );

        // Assert
        expect(result.current.warnings).toHaveLength(1);
        expect(result.current.affectedChildren).toHaveLength(2);
        // Each item should be an object, not a string
        expect(result.current.affectedChildren[0]).toEqual(
            expect.objectContaining({ account: 'Expenses:Food:Groceries', frequency: 'monthly' })
        );
        expect(result.current.affectedChildren[1]).toEqual(
            expect.objectContaining({ account: 'Expenses:Food:DiningOut', frequency: 'quarterly' })
        );
    });

    it('should NOT warn when lower-frequency budget exceeds higher-frequency equivalent (normal case)', () => {
        // Arrange
        // Monthly $500 ($6000/yr), creating Yearly $8000 → yearly is bigger, that's fine
        // The yearly budget having MORE room than the monthly implies is expected.
        const budgets = [
            createBudget('Expenses:Food', '500', 'monthly'),
        ];

        // Act
        const { result } = renderHook(() =>
            useBudgetValidation(budgets, 'Expenses:Food', 8000, 'StandardBudget', 'yearly')
        );

        // Assert — no warnings, no errors, no affected children
        expect(result.current.isValid).toBe(true);
        expect(result.current.error).toBeNull();
        expect(result.current.warnings).toHaveLength(0);
        expect(result.current.affectedChildren).toHaveLength(0);
    });

    it('should allow a lower-frequency budget that exceeds a higher-frequency equivalent (no warning)', () => {
        // Arrange
        // Existing: Monthly Food = $200 ($2400/yr)
        // New: Yearly Food = $3000 → $3000/yr > $2400/yr
        // This is the NORMAL case: yearly has more room than monthly implies.
        const budgets = [
            createBudget('Expenses:Food', '200', 'monthly'),
        ];

        // Act
        const { result } = renderHook(() =>
            useBudgetValidation(budgets, 'Expenses:Food', 3000, 'StandardBudget', 'yearly')
        );

        // Assert — valid, no error, no warning
        expect(result.current.isValid).toBe(true);
        expect(result.current.error).toBeNull();
        expect(result.current.warnings).toHaveLength(0);
    });

    it('should BLOCK a higher-frequency budget that exceeds the lower-frequency equivalent', () => {
        // Arrange
        // Existing: Yearly Food = $3000 ($3000/yr)
        // New: Monthly Food = $300 → $3600/yr > $3000/yr
        // Per rules: monthly cannot exceed yearly — blocking error
        const budgets = [
            createBudget('Expenses:Food', '3000', 'yearly'),
        ];

        // Act
        const { result } = renderHook(() =>
            useBudgetValidation(budgets, 'Expenses:Food', 300, 'StandardBudget', 'monthly')
        );

        // Assert — should be blocked
        expect(result.current.isValid).toBe(false);
        expect(result.current.error).toContain('Exceeds budget set by other period');
    });

    it('should NOT block or warn from monthly parent when yearly parent allows the child', () => {
        // Arrange
        // Parent: Expenses:Food has monthly $200 ($2400/yr) AND yearly $10000
        // Sibling: Expenses:Food:Restaurants monthly $100 ($1200/yr)
        // Child: Expenses:Food:Restaurants yearly $5000
        //
        // The yearly parent ($10000/yr - $1200/yr sibling = $8800/yr) allows $5000/yr.
        // The monthly parent ($2400/yr) should NOT warn — the yearly parent is the
        // relevant constraint at this frequency. Only warn from higher-freq parent
        // when no same/lower-freq parent exists.
        const budgets = [
            createBudget('Expenses:Food', '200', 'monthly'),
            createBudget('Expenses:Food:Restaurants', '100', 'monthly'),
            createBudget('Expenses:Food', '10000', 'yearly'),
        ];

        // Act
        const { result } = renderHook(() =>
            useBudgetValidation(budgets, 'Expenses:Food:Restaurants', 5000, 'StandardBudget', 'yearly')
        );

        // Assert — valid, no blocking error, and no misleading parent warnings
        expect(result.current.isValid).toBe(true);
        expect(result.current.error).toBeNull();
        // Should only have same-account warning (yearly $5000 > monthly $1200 equiv), NOT parent warning
        const parentWarnings = result.current.warnings.filter(w => w.includes('parent'));
        expect(parentWarnings).toHaveLength(0);
    });

    it('should BLOCK a monthly child by a monthly parent (same frequency parent check)', () => {
        // Arrange
        // Parent: Expenses:Food monthly $200 ($2400/yr)
        // Child: Expenses:Food:Restaurants monthly $300 → $3600/yr > $2400/yr → BLOCKED
        const budgets = [
            createBudget('Expenses:Food', '200', 'monthly'),
        ];

        // Act
        const { result } = renderHook(() =>
            useBudgetValidation(budgets, 'Expenses:Food:Restaurants', 300, 'StandardBudget', 'monthly')
        );

        // Assert — should be blocked by same-frequency parent
        expect(result.current.isValid).toBe(false);
        expect(result.current.error).toContain('Exceeds parent budget');
    });
});
