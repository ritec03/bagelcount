/**
 * Tests for BudgetFacade.addBudget
 *
 * Design notes:
 *  - The ConstraintConfig is captured at initializeBudgets time and reused for all
 *    subsequent mutation operations.  addBudget does NOT take its own config.
 *  - In mutation operations (unlike initializeBudgets), a 'blocking' constraint
 *    actually blocks the operation and returns OperationFailure.
 *  - initializeBudgets is assumed to work correctly and is used only for setup.
 */

import { describe, it, expect } from 'vitest';
import type {
  BudgetFacade,
  ExtendedBudget,
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

/** Parent role blocks, child role only warns. */
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

// Typed narrowing helpers so test assertions are ergonomic.
function asSuccess(r: ReturnType<BudgetFacade['addBudget']>): OperationSuccess {
  expect(r.success).toBe(true);
  return r as OperationSuccess;
}

function asFailure(r: ReturnType<BudgetFacade['addBudget']>): OperationFailure {
  expect(r.success).toBe(false);
  return r as OperationFailure;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('BudgetFacade.addBudget', () => {

  // ── (S) Simple / (Z) Zero ─────────────────────────────────────────────────

  describe('(S/Z) add to empty facade', () => {
    it('returns success when adding the very first budget to an empty facade', () => {
      // Arrange
      const facade = createBudgetFacade();
      facade.initializeBudgets([], ALL_DISABLED);
      const budget = raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly' });
      // Act
      const result = facade.addBudget(budget);
      // Assert
      expect(result.success).toBe(true);
    });

    it('includes the new budget in updates when adding to an empty facade', () => {
      // Arrange
      const facade = createBudgetFacade();
      facade.initializeBudgets([], ALL_DISABLED);
      const budget = raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly' });
      // Act
      const { updates } = asSuccess(facade.addBudget(budget));
      // Assert
      expect(updates).toHaveProperty('b');
      expect(updates['b'].id).toBe('b');
    });
  });

  // ── (O) One budget — success path ─────────────────────────────────────────

  describe('(O) add a leaf budget — no constraint violation', () => {
    it('succeeds and the new budget appears in updates', () => {
      // Arrange — existing parent has plenty of headroom
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'p', account: 'Expenses', amount: '1000', start_date: '2026-01-01', frequency: 'monthly' })],
        ALL_WARNING,
      );
      const child = raw({ id: 'c', account: 'Expenses:Food', amount: '400', start_date: '2026-01-01', frequency: 'monthly' });
      // Act
      const { updates } = asSuccess(facade.addBudget(child));
      // Assert
      expect(updates).toHaveProperty('c');
    });

    it('new budget in updates has a warnings field (empty when no violations)', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'p', account: 'Expenses', amount: '1000', start_date: '2026-01-01', frequency: 'monthly' })],
        ALL_WARNING,
      );
      const child = raw({ id: 'c', account: 'Expenses:Food', amount: '400', start_date: '2026-01-01', frequency: 'monthly' });
      const { updates } = asSuccess(facade.addBudget(child));
      const extended: ExtendedBudget = updates['c'];
      expect(extended).toHaveProperty('warnings');
      expect(extended.warnings).toEqual({});
    });
  });

  // ── (O) One budget — warning violation ────────────────────────────────────

  describe('(O) add a budget that causes a warning-mode violation', () => {
    it('returns success even when the new budget exceeds the parent in warning mode', () => {
      // Arrange — parent = 500; adding child = 800 → violation, but only a warning
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'p', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly' })],
        ALL_WARNING,
      );
      const child = raw({ id: 'c', account: 'Expenses:Food', amount: '800', start_date: '2026-01-01', frequency: 'monthly' });
      // Act
      const result = facade.addBudget(child);
      // Assert — warning mode: operation must succeed
      expect(result.success).toBe(true);
    });

    it('attaches a warning to the parent in updates when child exceeds it (parent role, warning mode)', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'p', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly' })],
        ALL_WARNING,
      );
      const child = raw({ id: 'c', account: 'Expenses:Food', amount: '800', start_date: '2026-01-01', frequency: 'monthly' });
      const { updates } = asSuccess(facade.addBudget(child));
      const parent = updates['p'];
      expect(parent).toBeDefined();
      expect(parent.warnings.ParentChildrenSum).toBeDefined();
      const parentWarning = parent.warnings.ParentChildrenSum!.find((w) => w.role === 'parent');
      expect(parentWarning).toBeDefined();
    });

    it('attaches a warning to the new child in updates when it exceeds the parent (child role, warning mode)', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'p', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly' })],
        ALL_WARNING,
      );
      const child = raw({ id: 'c', account: 'Expenses:Food', amount: '800', start_date: '2026-01-01', frequency: 'monthly' });
      const { updates } = asSuccess(facade.addBudget(child));
      const childResult = updates['c'];
      expect(childResult).toBeDefined();
      expect(childResult.warnings.ParentChildrenSum).toBeDefined();
      const childWarning = childResult.warnings.ParentChildrenSum!.find((w) => w.role === 'child');
      expect(childWarning).toBeDefined();
    });
  });

  // ── (O) One budget — blocking violation ───────────────────────────────────

  describe('(O) add a budget that triggers a blocking constraint', () => {
    it('returns failure when the new budget would exceed the parent in blocking mode', () => {
      // Arrange — parent = 500; adding child = 800 → violation, blocking mode
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'p', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly' })],
        ALL_BLOCKING,
      );
      const child = raw({ id: 'c', account: 'Expenses:Food', amount: '800', start_date: '2026-01-01', frequency: 'monthly' });
      // Act
      const result = facade.addBudget(child);
      // Assert
      expect(result.success).toBe(false);
    });

    it('populates errors on failure with the blocking violations', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'p', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly' })],
        ALL_BLOCKING,
      );
      const child = raw({ id: 'c', account: 'Expenses:Food', amount: '800', start_date: '2026-01-01', frequency: 'monthly' });
      const { errors } = asFailure(facade.addBudget(child));
      expect(errors.ParentChildrenSum).toBeDefined();
      expect(errors.ParentChildrenSum!.length).toBeGreaterThan(0);
    });

    it('does not mutate internal state when blocked — getBudgetList does not contain the rejected budget', () => {
      // After a blocked add, the budget must NOT appear in subsequent queries.
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'p', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly' })],
        ALL_BLOCKING,
      );
      const child = raw({ id: 'c', account: 'Expenses:Food', amount: '800', start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' });
      facade.addBudget(child); // should be blocked
      const list = facade.getBudgetList({ start: new Date('2026-01-01'), end: new Date('2026-01-31') });
      expect(list.map((b) => b.id)).not.toContain('c');
    });
  });

  // ── (M) Many — sequential adds & state propagation ────────────────────────

  describe('(M) sequential adds build state', () => {
    it('a second add can see the budget added by the first (no violation)', () => {
      // Arrange
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'p', account: 'Expenses', amount: '1000', start_date: '2026-01-01', frequency: 'monthly' })],
        ALL_DISABLED,
      );
      // First child — leaves headroom
      asSuccess(facade.addBudget(raw({ id: 'c1', account: 'Expenses:Food', amount: '400', start_date: '2026-01-01', frequency: 'monthly' })));
      // Second child — still within parent headroom (400 + 300 = 700 ≤ 1000)
      const result2 = facade.addBudget(raw({ id: 'c2', account: 'Expenses:Transport', amount: '300', start_date: '2026-01-01', frequency: 'monthly' }));
      // Assert
      expect(result2.success).toBe(true);
    });

    it('a second add that pushes children over parent triggers a violation (warning mode)', () => {
      // Arrange — parent = 500
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'p', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly' })],
        ALL_WARNING,
      );
      // First child = 300 (fine: 300 ≤ 500)
      asSuccess(facade.addBudget(raw({ id: 'c1', account: 'Expenses:Food', amount: '300', start_date: '2026-01-01', frequency: 'monthly' })));
      // Second child = 300 (300+300=600 > 500 → violation)
      const result2 = facade.addBudget(raw({ id: 'c2', account: 'Expenses:Transport', amount: '300', start_date: '2026-01-01', frequency: 'monthly' }));
      // Warning mode → still succeeds
      expect(result2.success).toBe(true);
      const { updates } = result2 as OperationSuccess;
      const parent = updates['p'];
      expect(parent).toBeDefined();
      expect(parent.warnings.ParentChildrenSum).toBeDefined();
    });

    it('parent budget appears in updates whenever the new child changes the constraint state', () => {
      // The facade must include the parent in updates so the UI can re-render it.
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'p', account: 'Expenses', amount: '1000', start_date: '2026-01-01', frequency: 'monthly' })],
        ALL_WARNING,
      );
      const { updates } = asSuccess(
        facade.addBudget(raw({ id: 'c', account: 'Expenses:Food', amount: '400', start_date: '2026-01-01', frequency: 'monthly' })),
      );
      // Parent is recalculated (even if no violation), it should appear in updates.
      expect(updates).toHaveProperty('p');
    });
  });

  // ── (B) Boundary ──────────────────────────────────────────────────────────

  describe('(B) boundary: exact headroom', () => {
    it('does not trigger a warning when the new child equals the remaining headroom exactly', () => {
      // parent = 1000, existing child = 600, new child = 400 → sum = 1000 = parent exactly (not a violation)
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p',  account: 'Expenses',      amount: '1000', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c1', account: 'Expenses:Food', amount: '600',  start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        ALL_WARNING,
      );
      const newChild = raw({ id: 'c2', account: 'Expenses:Transport', amount: '400', start_date: '2026-01-01', frequency: 'monthly' });
      const { updates } = asSuccess(facade.addBudget(newChild));
      const parent = updates['p'];
      // No violation: warnings should be empty or absent on the parent
      const parentWarnings = parent?.warnings.ParentChildrenSum ?? [];
      expect(parentWarnings.filter((w) => w.role === 'parent')).toHaveLength(0);
    });
  });

  describe('(B) boundary: duplicate id', () => {
    it('returns failure when a budget with the same id already exists', () => {
      // Adding a budget with a duplicate ID must be rejected — IDs must be unique.
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly' })],
        ALL_DISABLED,
      );
      // Try to add another budget with the same id
      const duplicate = raw({ id: 'b', account: 'Expenses:Food', amount: '200', start_date: '2026-01-01', frequency: 'monthly' });
      const result = facade.addBudget(duplicate);
      expect(result.success).toBe(false);
    });
  });

  // ── (I) Interface guarantees ───────────────────────────────────────────────

  describe('(I) OperationSuccess shape', () => {
    it('updates is a Record keyed by budget id', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets([], ALL_DISABLED);
      const { updates } = asSuccess(
        facade.addBudget(raw({ id: 'x', account: 'Expenses', amount: '100', start_date: '2026-01-01', frequency: 'monthly' })),
      );
      // Keys must be string IDs
      for (const key of Object.keys(updates)) {
        expect(typeof key).toBe('string');
        expect(updates[key].id).toBe(key);
      }
    });

    it('each ExtendedBudget in updates has a warnings field', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets([], ALL_DISABLED);
      const { updates } = asSuccess(
        facade.addBudget(raw({ id: 'x', account: 'Expenses', amount: '100', start_date: '2026-01-01', frequency: 'monthly' })),
      );
      for (const budget of Object.values(updates)) {
        expect(budget).toHaveProperty('warnings');
      }
    });
  });

  describe('(I) OperationFailure shape', () => {
    it('failure has both errors and warnings fields', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'p', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly' })],
        ALL_BLOCKING,
      );
      const child = raw({ id: 'c', account: 'Expenses:Food', amount: '800', start_date: '2026-01-01', frequency: 'monthly' });
      const failure = asFailure(facade.addBudget(child));
      expect(failure).toHaveProperty('errors');
      expect(failure).toHaveProperty('warnings');
    });
  });

  // ── (E) Mixed blocking + warning violations ────────────────────────────────

  describe('(E) mixed blocking parent + warning child', () => {
    it('populates errors (from blocking parent role) AND warnings (from warning child role) on failure', () => {
      // Config: parent role is blocking (blocks the add), child role is warning only.
      // When the add fails due to the parent-role block, both fields should be populated
      // so the user can see all issues at once.
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'p', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly' })],
        PARENT_BLOCKING_CHILD_WARNING,
      );
      const child = raw({ id: 'c', account: 'Expenses:Food', amount: '800', start_date: '2026-01-01', frequency: 'monthly' });
      const failure = asFailure(facade.addBudget(child));
      // Blocking violation on the parent → goes into errors
      expect(failure.errors.ParentChildrenSum).toBeDefined();
      // Warning violation on the child → goes into warnings
      expect(failure.warnings.ParentChildrenSum).toBeDefined();
    });
  });
});
