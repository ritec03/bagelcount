/**
 * Tests for BudgetFacade.getBudgetList
 *
 * Assumption: initializeBudgets works correctly and is used only for setup.
 * The facade is stateful: initializeBudgets seeds internal state,
 * getBudgetList queries that state filtered to the given date range.
 */

import { describe, it, expect } from 'vitest';
import type { BudgetFacade, ExtendedBudget } from './budgetOperationsFacade';
import type { ConstraintConfig } from './constraints';
import type { StandardBudgetOutput } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

const ALL_DISABLED: ConstraintConfig = {
  ParentChildrenSum: { parent: 'disabled', child: 'disabled' },
};

const ALL_WARNING: ConstraintConfig = {
  ParentChildrenSum: { parent: 'warning', child: 'warning' },
};

type RawOverride = Partial<StandardBudgetOutput> & {
  id: string;
  account: string;
  amount: string;
  start_date: string;
  frequency: 'monthly' | 'quarterly' | 'yearly';
};

function raw(o: RawOverride): StandardBudgetOutput {
  return {
    currency: 'CAD',
    end_date: null,
    ...o,
  };
}

// The facade must be constructed fresh per test to avoid shared state.
function createBudgetFacade(): BudgetFacade {
  throw new Error('NOT IMPLEMENTED — replace with real import');
}

// Convenience: build a Date from an ISO date string.
function d(iso: string): Date {
  return new Date(iso);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('BudgetFacade.getBudgetList', () => {

  // ── (Z) Zero ──────────────────────────────────────────────────────────────

  describe('(Z) zero budgets', () => {
    it('returns an empty array when initialized with no budgets', () => {
      // Arrange
      const facade = createBudgetFacade();
      facade.initializeBudgets([], ALL_DISABLED);
      // Act
      const result = facade.getBudgetList({ start: d('2026-01-01'), end: d('2026-01-31') });
      // Assert
      expect(result).toEqual([]);
    });

    it('returns an empty array when no budgets fall in the query range', () => {
      // Arrange — budget is entirely in 2025, query is for 2026
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2025-01-01', frequency: 'monthly', end_date: '2025-01-31' })],
        ALL_DISABLED,
      );
      // Act
      const result = facade.getBudgetList({ start: d('2026-01-01'), end: d('2026-01-31') });
      // Assert
      expect(result).toEqual([]);
    });
  });

  // ── (S) Simple / (O) One ──────────────────────────────────────────────────

  describe('(S) single budget, range exactly matches', () => {
    it('returns the budget when the query range exactly equals its effective range', () => {
      // Arrange
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' })],
        ALL_DISABLED,
      );
      // Act
      const result = facade.getBudgetList({ start: d('2026-01-01'), end: d('2026-01-31') });
      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('b');
    });
  });

  describe('(O) one budget — overlap detection', () => {
    it('returns the budget when the query range partially overlaps it', () => {
      // Arrange — budget covers Jan; query covers the last week of Jan into Feb
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' })],
        ALL_DISABLED,
      );
      // Act
      const result = facade.getBudgetList({ start: d('2026-01-25'), end: d('2026-02-05') });
      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('b');
    });

    it('does not return the budget when the query range is entirely before it', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-02-01', frequency: 'monthly', end_date: '2026-02-28' })],
        ALL_DISABLED,
      );
      const result = facade.getBudgetList({ start: d('2026-01-01'), end: d('2026-01-31') });
      expect(result).toEqual([]);
    });

    it('does not return the budget when the query range is entirely after it', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' })],
        ALL_DISABLED,
      );
      const result = facade.getBudgetList({ start: d('2026-02-01'), end: d('2026-02-28') });
      expect(result).toEqual([]);
    });
  });

  // ── (M) Many ──────────────────────────────────────────────────────────────

  describe('(M) multiple budgets — only overlapping ones returned', () => {
    it('returns only budgets whose effective range overlaps the query', () => {
      // Arrange — Jan, Feb, Mar budgets; query is just Feb
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'jan', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' }),
          raw({ id: 'feb', account: 'Expenses', amount: '600', start_date: '2026-02-01', frequency: 'monthly', end_date: '2026-02-28' }),
          raw({ id: 'mar', account: 'Expenses', amount: '700', start_date: '2026-03-01', frequency: 'monthly', end_date: '2026-03-31' }),
        ],
        ALL_DISABLED,
      );
      // Act — query exactly Feb
      const result = facade.getBudgetList({ start: d('2026-02-01'), end: d('2026-02-28') });
      // Assert
      const ids = result.map((r) => r.id);
      expect(ids).toContain('feb');
      expect(ids).not.toContain('jan');
      expect(ids).not.toContain('mar');
    });

    it('returns all budgets (parent + children) that overlap the query when they share the same range', () => {
      // Arrange — parent + two children, all Jan 2026
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p',  account: 'Expenses',           amount: '1000', start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' }),
          raw({ id: 'c1', account: 'Expenses:Food',      amount: '400',  start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' }),
          raw({ id: 'c2', account: 'Expenses:Transport', amount: '300',  start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' }),
        ],
        ALL_DISABLED,
      );
      // Act
      const result = facade.getBudgetList({ start: d('2026-01-01'), end: d('2026-01-31') });
      // Assert
      expect(result).toHaveLength(3);
      const ids = result.map((r) => r.id);
      expect(ids).toContain('p');
      expect(ids).toContain('c1');
      expect(ids).toContain('c2');
    });

    it('preserves constraint warnings on returned budgets as computed during initializeBudgets', () => {
      // Parent = 500, children sum = 600 → violation; warnings must survive getBudgetList.
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p',  account: 'Expenses',           amount: '500', start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' }),
          raw({ id: 'c1', account: 'Expenses:Food',      amount: '300', start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' }),
          raw({ id: 'c2', account: 'Expenses:Transport', amount: '300', start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' }),
        ],
        ALL_WARNING,
      );
      // Act
      const result = facade.getBudgetList({ start: d('2026-01-01'), end: d('2026-01-31') });
      // Assert — parent-role warning must be present on the parent budget
      const parent = result.find((r) => r.id === 'p')!;
      expect(parent).toBeDefined();
      expect(parent.warnings.ParentChildrenSum).toBeDefined();
    });
  });

  // ── (B) Boundary ──────────────────────────────────────────────────────────

  describe('(B) boundary: exact edge dates', () => {
    it('includes a budget whose start_date equals the query start', () => {
      // The budget starts exactly when the query starts — must be included.
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-02-01', frequency: 'monthly', end_date: '2026-02-28' })],
        ALL_DISABLED,
      );
      const result = facade.getBudgetList({ start: d('2026-02-01'), end: d('2026-03-31') });
      expect(result.map((r) => r.id)).toContain('b');
    });

    it('includes a budget whose end_date equals the query end', () => {
      // The budget ends exactly when the query ends — must be included.
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' })],
        ALL_DISABLED,
      );
      const result = facade.getBudgetList({ start: d('2025-12-01'), end: d('2026-01-31') });
      expect(result.map((r) => r.id)).toContain('b');
    });

    it('does not include a budget that ends exactly when the query starts (adjacent, non-overlapping)', () => {
      // Budget [Jan 1–31], query [Feb 1+] — they touch but do not overlap.
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' })],
        ALL_DISABLED,
      );
      // Query starts on the first day after the budget ends.
      const result = facade.getBudgetList({ start: d('2026-02-01'), end: d('2026-02-28') });
      expect(result).toEqual([]);
    });
  });

  describe('(B) open-ended budgets (end_date: null)', () => {
    it('includes an open-ended budget for any query range after its start_date', () => {
      // An open-ended budget should always appear for queries that start after its start_date.
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly', end_date: null })],
        ALL_DISABLED,
      );
      // Query far into the future
      const result = facade.getBudgetList({ start: d('2030-01-01'), end: d('2030-12-31') });
      expect(result.map((r) => r.id)).toContain('b');
    });

    it('does not include an open-ended budget for a query range entirely before its start_date', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2027-01-01', frequency: 'monthly', end_date: null })],
        ALL_DISABLED,
      );
      // Query in 2026 — budget has not started yet
      const result = facade.getBudgetList({ start: d('2026-01-01'), end: d('2026-12-31') });
      expect(result).toEqual([]);
    });
  });

  // ── (I) Interface ──────────────────────────────────────────────────────────

  describe('(I) interface guarantees', () => {
    it('returned items satisfy the ExtendedBudget shape (have warnings and id fields)', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' })],
        ALL_DISABLED,
      );
      const result: ExtendedBudget[] = facade.getBudgetList({ start: d('2026-01-01'), end: d('2026-01-31') });
      expect(result[0]).toHaveProperty('warnings');
      expect(result[0]).toHaveProperty('id');
    });

    it('returns a new array instance each call (does not expose internal state by reference)', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' })],
        ALL_DISABLED,
      );
      const range = { start: d('2026-01-01'), end: d('2026-01-31') };
      const first  = facade.getBudgetList(range);
      const second = facade.getBudgetList(range);
      // Must be distinct array instances to prevent accidental mutation of internal state.
      expect(first).not.toBe(second);
    });
  });

  // ── (E) Edge Cases / Exceptions ───────────────────────────────────────────

  describe('(E) edge cases', () => {
    it('returns empty or throws when start is after end (inverted range)', () => {
      // Inverted range is invalid; the implementation may return [] or throw.
      // This test accepts both — pin the exact behaviour once the contract is defined.
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' })],
        ALL_DISABLED,
      );
      const call = () => facade.getBudgetList({ start: d('2026-02-01'), end: d('2026-01-01') });
      let result: ExtendedBudget[] | undefined;
      try {
        result = call();
      } catch {
        return; // throwing is an acceptable contract for an inverted range
      }
      expect(result).toEqual([]);
    });

    it('a single-day query returns budgets whose range includes that day', () => {
      // A zero-width query (start === end) should still match overlapping budgets.
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' })],
        ALL_DISABLED,
      );
      const result = facade.getBudgetList({ start: d('2026-01-15'), end: d('2026-01-15') });
      expect(result.map((r) => r.id)).toContain('b');
    });
  });
});
