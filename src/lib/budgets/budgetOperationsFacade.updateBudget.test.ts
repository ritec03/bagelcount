/**
 * Tests for BudgetFacade.updateBudget
 *
 * Design notes:
 *  - `id` param identifies which budget to update.
 *  - `budget` carries the fields to change; MUST include `id` (used for consistency).
 *    The `id` inside `budget` must agree with the `id` param — a mismatch is an error.
 *  - Only the provided fields are changed; omitted fields keep their current values.
 *  - Constraint config is captured at initializeBudgets time; updateBudget reuses it.
 *  - In mutations, a 'blocking' mode actually rejects the operation.
 *  - initializeBudgets is assumed to work and is used only for setup.
 */

import { describe, it, expect } from 'vitest';
import type {
  BudgetFacade,
  OperationSuccess,
  OperationFailure,
} from './budgetOperationsFacade';
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

const ALL_BLOCKING: ConstraintConfig = {
  ParentChildrenSum: { parent: 'blocking', child: 'blocking' },
};

const PARENT_BLOCKING_CHILD_WARNING: ConstraintConfig = {
  ParentChildrenSum: { parent: 'blocking', child: 'warning' },
};

type RawOverride = Partial<StandardBudgetOutput> & {
  id: string;
  account: string;
  amount: string;
  start_date: string;
  frequency: 'monthly' | 'quarterly' | 'yearly';
};

function raw(o: RawOverride): StandardBudgetOutput {
  return { currency: 'CAD', end_date: null, ...o };
}

// The facade must be constructed fresh per test to avoid shared state.
function createBudgetFacade(): BudgetFacade {
  throw new Error('NOT IMPLEMENTED — replace with real import');
}

function asSuccess(r: ReturnType<BudgetFacade['updateBudget']>): OperationSuccess {
  expect(r.success).toBe(true);
  return r as OperationSuccess;
}

function asFailure(r: ReturnType<BudgetFacade['updateBudget']>): OperationFailure {
  expect(r.success).toBe(false);
  return r as OperationFailure;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('BudgetFacade.updateBudget', () => {

  // ── (Z) Zero / non-existent id ────────────────────────────────────────────

  describe('(Z) non-existent id', () => {
    it('returns failure when the target id does not exist in an empty facade', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets([], ALL_DISABLED);
      const result = facade.updateBudget('missing', { id: 'missing', amount: '500' });
      expect(result.success).toBe(false);
    });

    it('returns failure when the target id does not exist among loaded budgets', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly' })],
        ALL_DISABLED,
      );
      const result = facade.updateBudget('ghost', { id: 'ghost', amount: '200' });
      expect(result.success).toBe(false);
    });
  });

  // ── (S) Simple — single-field update, no violation ────────────────────────

  describe('(S) update a single field — no constraint violation', () => {
    it('returns success when updating an isolated budget (no parent or children)', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly' })],
        ALL_DISABLED,
      );
      const result = facade.updateBudget('b', { id: 'b', amount: '600' });
      expect(result.success).toBe(true);
    });

    it('the updated budget in updates reflects the new field value', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly' })],
        ALL_DISABLED,
      );
      const { updates } = asSuccess(facade.updateBudget('b', { id: 'b', amount: '999' }));
      expect(updates['b'].amount).toBe('999');
    });

    it('fields not included in the update payload retain their original values', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly', currency: 'CAD' })],
        ALL_DISABLED,
      );
      // Update only the amount — currency must stay 'CAD'
      const { updates } = asSuccess(facade.updateBudget('b', { id: 'b', amount: '700' }));
      expect(updates['b'].currency).toBe('CAD');
    });
  });

  // ── (O) One — warning-mode violation ──────────────────────────────────────

  describe('(O) update that causes a warning-mode violation', () => {
    it('returns success when an increased child amount exceeds the parent (warning mode)', () => {
      // Arrange: parent=1000, child=400 (fine). Update child → 1200 > 1000 → warning only.
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p', account: 'Expenses',      amount: '1000', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c', account: 'Expenses:Food', amount: '400',  start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        ALL_WARNING,
      );
      const result = facade.updateBudget('c', { id: 'c', amount: '1200' });
      expect(result.success).toBe(true);
    });

    it('attaches a parent-role warning on the parent when child amount exceeds it', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p', account: 'Expenses',      amount: '1000', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c', account: 'Expenses:Food', amount: '400',  start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        ALL_WARNING,
      );
      const { updates } = asSuccess(facade.updateBudget('c', { id: 'c', amount: '1200' }));
      const parent = updates['p'];
      expect(parent).toBeDefined();
      expect(parent.warnings.ParentChildrenSum).toBeDefined();
      expect(parent.warnings.ParentChildrenSum!.some((w) => w.role === 'parent')).toBe(true);
    });

    it('attaches a child-role warning on the updated budget itself', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p', account: 'Expenses',      amount: '1000', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c', account: 'Expenses:Food', amount: '400',  start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        ALL_WARNING,
      );
      const { updates } = asSuccess(facade.updateBudget('c', { id: 'c', amount: '1200' }));
      const child = updates['c'];
      expect(child.warnings.ParentChildrenSum).toBeDefined();
      expect(child.warnings.ParentChildrenSum!.some((w) => w.role === 'child')).toBe(true);
    });
  });

  // ── (O) One — blocking violation ──────────────────────────────────────────

  describe('(O) update that triggers a blocking constraint', () => {
    it('returns failure when child amount exceeds parent in blocking mode', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p', account: 'Expenses',      amount: '1000', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c', account: 'Expenses:Food', amount: '400',  start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        ALL_BLOCKING,
      );
      const result = facade.updateBudget('c', { id: 'c', amount: '1200' });
      expect(result.success).toBe(false);
    });

    it('populates errors with the blocking violations on failure', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p', account: 'Expenses',      amount: '1000', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c', account: 'Expenses:Food', amount: '400',  start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        ALL_BLOCKING,
      );
      const { errors } = asFailure(facade.updateBudget('c', { id: 'c', amount: '1200' }));
      expect(errors.ParentChildrenSum).toBeDefined();
      expect(errors.ParentChildrenSum!.length).toBeGreaterThan(0);
    });

    it('does not mutate state when blocked — getBudgetList still shows original amount', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p', account: 'Expenses',      amount: '1000', start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' }),
          raw({ id: 'c', account: 'Expenses:Food', amount: '400',  start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' }),
        ],
        ALL_BLOCKING,
      );
      facade.updateBudget('c', { id: 'c', amount: '1200' }); // blocked
      const list = facade.getBudgetList({ start: new Date('2026-01-01'), end: new Date('2026-01-31') });
      const child = list.find((b) => b.id === 'c')!;
      expect(child.amount).toBe('400'); // original value preserved
    });
  });

  // ── (O) Decrease that clears a violation ─────────────────────────────────

  describe('(O) amount decrease that resolves an existing warning', () => {
    it('clears the violation warning after reducing the child below the parent', () => {
      // Start with a violation (child > parent), then fix it via updateBudget.
      const facade = createBudgetFacade();
      // initializeBudgets in warning mode so the initial state already has warnings
      facade.initializeBudgets(
        [
          raw({ id: 'p', account: 'Expenses',      amount: '500',  start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c', account: 'Expenses:Food', amount: '800',  start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        ALL_WARNING,
      );
      // Reduce child to 300 — now 300 ≤ 500, violation cleared
      const { updates } = asSuccess(facade.updateBudget('c', { id: 'c', amount: '300' }));
      const parent = updates['p']!;
      const parentWarnings = parent.warnings.ParentChildrenSum ?? [];
      expect(parentWarnings.filter((w) => w.role === 'parent')).toHaveLength(0);
    });
  });

  // ── (M) Many — affected nodes in updates ──────────────────────────────────

  describe('(M) multiple affected nodes appear in updates', () => {
    it('includes the parent in updates when a child amount change affects constraint state', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p', account: 'Expenses',      amount: '1000', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c', account: 'Expenses:Food', amount: '400',  start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        ALL_WARNING,
      );
      const { updates } = asSuccess(facade.updateBudget('c', { id: 'c', amount: '600' }));
      // Parent recalculates headroom — must appear in updates
      expect(Object.keys(updates)).toContain('p');
    });

    it('includes sibling budgets in updates when they are affected by the recalculation', () => {
      // parent=1000, c1=400, c2=400. Update c1→700 → total=1100>1000 → both c1 and c2 carry child-role warnings.
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p',  account: 'Expenses',           amount: '1000', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c1', account: 'Expenses:Food',      amount: '400',  start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c2', account: 'Expenses:Transport', amount: '400',  start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        ALL_WARNING,
      );
      const { updates } = asSuccess(facade.updateBudget('c1', { id: 'c1', amount: '700' }));
      // c2 is a sibling that is now part of the violation — it must appear in updates too
      expect(Object.keys(updates)).toContain('c2');
    });
  });

  // ── (B) Boundary: exact headroom ─────────────────────────────────────────

  describe('(B) boundary: update to exactly the headroom limit', () => {
    it('does not trigger a warning when the updated amount brings children precisely to the parent total', () => {
      // parent=1000, c1=400. Update c1→1000 → sum=1000=parent exactly (no violation).
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p',  account: 'Expenses',      amount: '1000', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c1', account: 'Expenses:Food', amount: '400',  start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        ALL_WARNING,
      );
      const { updates } = asSuccess(facade.updateBudget('c1', { id: 'c1', amount: '1000' }));
      const parent = updates['p']!;
      const parentWarnings = parent?.warnings.ParentChildrenSum ?? [];
      expect(parentWarnings.filter((w) => w.role === 'parent')).toHaveLength(0);
    });
  });

  describe('(B) boundary: id mismatch', () => {
    it('returns failure when the id param differs from the id field inside budget', () => {
      // Both the first argument and budget.id must agree — a mismatch is a programming error.
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly' })],
        ALL_DISABLED,
      );
      // id param says 'b', but budget.id says 'other'
      const result = facade.updateBudget('b', { id: 'other', amount: '600' });
      expect(result.success).toBe(false);
    });
  });

  // ── (I) Interface guarantees ───────────────────────────────────────────────

  describe('(I) OperationSuccess shape', () => {
    it('updates is a Record where each key matches the id of its ExtendedBudget value', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly' })],
        ALL_DISABLED,
      );
      const { updates } = asSuccess(facade.updateBudget('b', { id: 'b', amount: '600' }));
      for (const [key, value] of Object.entries(updates)) {
        expect(value.id).toBe(key);
      }
    });

    it('every ExtendedBudget in updates has a warnings field', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly' })],
        ALL_DISABLED,
      );
      const { updates } = asSuccess(facade.updateBudget('b', { id: 'b', amount: '600' }));
      for (const budget of Object.values(updates)) {
        expect(budget).toHaveProperty('warnings');
      }
    });
  });

  describe('(I) OperationFailure shape', () => {
    it('failure has both errors and warnings fields', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p', account: 'Expenses',      amount: '500', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c', account: 'Expenses:Food', amount: '100', start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        ALL_BLOCKING,
      );
      const failure = asFailure(facade.updateBudget('c', { id: 'c', amount: '800' }));
      expect(failure).toHaveProperty('errors');
      expect(failure).toHaveProperty('warnings');
    });
  });

  // ── (E) Mixed blocking + warning ──────────────────────────────────────────

  describe('(E) mixed blocking parent + warning child', () => {
    it('populates both errors (parent-role block) and warnings (child-role warn) on failure', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p', account: 'Expenses',      amount: '500', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c', account: 'Expenses:Food', amount: '100', start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        PARENT_BLOCKING_CHILD_WARNING,
      );
      const failure = asFailure(facade.updateBudget('c', { id: 'c', amount: '800' }));
      // Blocking parent-role violation → goes into errors
      expect(failure.errors.ParentChildrenSum).toBeDefined();
      // Warning child-role violation → goes into warnings
      expect(failure.warnings.ParentChildrenSum).toBeDefined();
    });
  });
});
