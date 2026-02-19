/**
 * Tests for BudgetFacade.removeBudget
 *
 * Design notes:
 *  - On success, Result.updates contains the *parent* budget (recalculated totals)
 *    and any siblings whose warning state changed.
 *  - Removing a child can only REDUCE children's sum vs the parent — so the
 *    ParentChildrenSum constraint never blocks a well-formed removal.
 *  - Gap hierarchies are allowed: a budget for Expenses:Food:Restaurants:FineDining
 *    may exist without a budget for Expenses:Food:Restaurants. Removing an intermediate
 *    account budget (e.g. Expenses:Food) is therefore valid even when deeper
 *    descendant budgets exist — they are NOT orphaned.
 *  - Constraint config is captured at initializeBudgets time.
 *  - initializeBudgets is assumed to work and is used only for setup.
 */

import { describe, it, expect } from 'vitest';
import type {
  BudgetFacade,
  OperationSuccess,
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

function asSuccess(r: ReturnType<BudgetFacade['removeBudget']>): OperationSuccess {
  expect(r.success).toBe(true);
  return r as OperationSuccess;
}

// function asFailure(r: ReturnType<BudgetFacade['removeBudget']>): OperationFailure {
//   expect(r.success).toBe(false);
//   return r as OperationFailure;
// }

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('BudgetFacade.removeBudget', () => {

  // ── (Z) Zero ──────────────────────────────────────────────────────────────

  describe('(Z) non-existent id', () => {
    it('returns failure when the facade has no budgets', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets([], ALL_DISABLED);
      expect(facade.removeBudget('ghost').success).toBe(false);
    });

    it('returns failure when the id does not match any loaded budget', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly' })],
        ALL_DISABLED,
      );
      expect(facade.removeBudget('missing').success).toBe(false);
    });
  });

  // ── (S / O) Simple / remove isolated leaf ─────────────────────────────────

  describe('(S) remove a standalone budget (no parent, no children)', () => {
    it('returns success', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' })],
        ALL_DISABLED,
      );
      expect(facade.removeBudget('b').success).toBe(true);
    });

    it('the removed budget no longer appears in getBudgetList', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' })],
        ALL_DISABLED,
      );
      facade.removeBudget('b');
      const list = facade.getBudgetList({ start: new Date('2026-01-01'), end: new Date('2026-01-31') });
      expect(list.map((b) => b.id)).not.toContain('b');
    });
  });

  // ── (O) Remove a child from a clean parent ────────────────────────────────

  describe('(O) remove a child budget — no prior violation', () => {
    it('returns success when removing a leaf child', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p', account: 'Expenses',      amount: '1000', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c', account: 'Expenses:Food', amount: '400',  start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        ALL_WARNING,
      );
      expect(facade.removeBudget('c').success).toBe(true);
    });

    it('parent appears in updates with recalculated (empty) warnings after child removal', () => {
      // Parent had no warnings before; after removing the child it still has none.
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p', account: 'Expenses',      amount: '1000', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c', account: 'Expenses:Food', amount: '400',  start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        ALL_WARNING,
      );
      const { updates } = asSuccess(facade.removeBudget('c'));
      expect(updates).toHaveProperty('p');
      expect(updates['p'].warnings).toEqual({});
    });

    it('the removed child does not appear in updates', () => {
      // The removed budget is gone — it must not be included in the updates map.
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p', account: 'Expenses',      amount: '1000', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c', account: 'Expenses:Food', amount: '400',  start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        ALL_WARNING,
      );
      const { updates } = asSuccess(facade.removeBudget('c'));
      expect(Object.keys(updates)).not.toContain('c');
    });
  });

  // ── (O) Remove the violating child — warning cleared on parent ─────────────

  describe('(O) remove a child that was causing a constraint warning', () => {
    it('succeeds even though a warning existed before removal', () => {
      // Removing a child only reduces the sum — never a constraint violation.
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p', account: 'Expenses',      amount: '500', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c', account: 'Expenses:Food', amount: '800', start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        ALL_WARNING,
      );
      // The violation (child > parent) exists; removal should succeed.
      expect(facade.removeBudget('c').success).toBe(true);
    });

    it('clears the parent-role warning on the parent after the violating child is removed', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p', account: 'Expenses',      amount: '500', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c', account: 'Expenses:Food', amount: '800', start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        ALL_WARNING,
      );
      const { updates } = asSuccess(facade.removeBudget('c'));
      const parent = updates['p']!;
      // No children left → no sum-exceeds-parent violation possible.
      expect(parent.warnings).toEqual({});
    });
  });

  // ── (M) Many — siblings recalculated ─────────────────────────────────────

  describe('(M) remove one of several siblings', () => {
    it('returns success and remaining siblings appear in updates', () => {
      // parent=500, c1=300, c2=300 (total=600 → violation). Remove c1 → total=300 ≤ 500: clear.
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p',  account: 'Expenses',           amount: '500', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c1', account: 'Expenses:Food',      amount: '300', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c2', account: 'Expenses:Transport', amount: '300', start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        ALL_WARNING,
      );
      const { updates } = asSuccess(facade.removeBudget('c1'));
      // c2 was a violator and is now clean after c1 is gone — it must be recalculated.
      expect(Object.keys(updates)).toContain('c2');
    });

    it('sibling warning is cleared when removal resolves the constraint violation', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p',  account: 'Expenses',           amount: '500', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c1', account: 'Expenses:Food',      amount: '300', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c2', account: 'Expenses:Transport', amount: '300', start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        ALL_WARNING,
      );
      const { updates } = asSuccess(facade.removeBudget('c1'));
      // c2 was in violation; after c1's removal the sum is 300 ≤ 500 — warning gone.
      expect(updates['c2'].warnings).toEqual({});
    });

    it('removed budget does not appear in getBudgetList after successful removal', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p',  account: 'Expenses',           amount: '500', start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' }),
          raw({ id: 'c1', account: 'Expenses:Food',      amount: '300', start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' }),
          raw({ id: 'c2', account: 'Expenses:Transport', amount: '300', start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' }),
        ],
        ALL_DISABLED,
      );
      facade.removeBudget('c1');
      const list = facade.getBudgetList({ start: new Date('2026-01-01'), end: new Date('2026-01-31') });
      expect(list.map((b) => b.id)).not.toContain('c1');
      expect(list.map((b) => b.id)).toContain('c2');
    });
  });

  // ── (B) Boundary: remove the only child ───────────────────────────────────

  describe('(B) remove the only child', () => {
    it('succeeds and parent in updates has no children-related warnings', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p', account: 'Expenses',      amount: '500', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c', account: 'Expenses:Food', amount: '300', start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        ALL_WARNING,
      );
      const { updates } = asSuccess(facade.removeBudget('c'));
      expect(updates).toHaveProperty('p');
      expect(updates['p'].warnings).toEqual({});
    });
  });

  describe('(B) remove the last budget (facade becomes empty)', () => {
    it('succeeds and getBudgetList returns empty for any range', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [raw({ id: 'b', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' })],
        ALL_DISABLED,
      );
      asSuccess(facade.removeBudget('b'));
      const list = facade.getBudgetList({ start: new Date('2026-01-01'), end: new Date('2026-01-31') });
      expect(list).toEqual([]);
    });
  });

  // ── (I) Interface guarantees ───────────────────────────────────────────────

  describe('(I) OperationSuccess shape', () => {
    it('updates is a Record where each key matches its ExtendedBudget id', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p', account: 'Expenses',      amount: '1000', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c', account: 'Expenses:Food', amount: '400',  start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        ALL_DISABLED,
      );
      const { updates } = asSuccess(facade.removeBudget('c'));
      for (const [key, value] of Object.entries(updates)) {
        expect(value.id).toBe(key);
      }
    });

    it('every ExtendedBudget in updates has a warnings field', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'p', account: 'Expenses',      amount: '1000', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'c', account: 'Expenses:Food', amount: '400',  start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        ALL_DISABLED,
      );
      const { updates } = asSuccess(facade.removeBudget('c'));
      for (const budget of Object.values(updates)) {
        expect(budget).toHaveProperty('warnings');
      }
    });
  });

  // ── (E) Gap hierarchy: remove an intermediate account ─────────────────────
  // The system allows gaps in the account hierarchy. A budget node for
  // Expenses:Food may be removed even when Expenses:Food:Restaurants still
  // exists — the deeper node is not an orphan; it simply has no explicit
  // intermediate parent budget.

  describe('(E) remove an intermediate account budget (gap hierarchy)', () => {
    it('succeeds when a deeper descendant exists but the intermediate budget is removed', () => {
      // Expenses        1000
      //   Expenses:Food  600   ← this one is removed
      //     Expenses:Food:Restaurants 250
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'root', account: 'Expenses',                  amount: '1000', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'food', account: 'Expenses:Food',             amount: '600',  start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'rest', account: 'Expenses:Food:Restaurants', amount: '250',  start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        ALL_DISABLED,
      );
      // Gap hierarchy: removing 'food' is valid — 'rest' still has 'root' as its ancestor.
      expect(facade.removeBudget('food').success).toBe(true);
    });

    it('the deeper descendant remains in getBudgetList after the intermediate is removed', () => {
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'root', account: 'Expenses',                  amount: '1000', start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' }),
          raw({ id: 'food', account: 'Expenses:Food',             amount: '600',  start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' }),
          raw({ id: 'rest', account: 'Expenses:Food:Restaurants', amount: '250',  start_date: '2026-01-01', frequency: 'monthly', end_date: '2026-01-31' }),
        ],
        ALL_DISABLED,
      );
      facade.removeBudget('food');
      const list = facade.getBudgetList({ start: new Date('2026-01-01'), end: new Date('2026-01-31') });
      const ids = list.map((b) => b.id);
      expect(ids).not.toContain('food');  // removed
      expect(ids).toContain('rest');       // still present — not orphaned
      expect(ids).toContain('root');       // still present
    });

    it('the ancestor budget in updates is recalculated after the gap is created', () => {
      // After removing 'food', 'root' now directly contains 'rest' (250) as a descendant.
      // Its constraint state should be recalculated with the updated subtree.
      const facade = createBudgetFacade();
      facade.initializeBudgets(
        [
          raw({ id: 'root', account: 'Expenses',                  amount: '1000', start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'food', account: 'Expenses:Food',             amount: '600',  start_date: '2026-01-01', frequency: 'monthly' }),
          raw({ id: 'rest', account: 'Expenses:Food:Restaurants', amount: '250',  start_date: '2026-01-01', frequency: 'monthly' }),
        ],
        ALL_WARNING,
      );
      const { updates } = asSuccess(facade.removeBudget('food'));
      // The ancestor must appear in updates — its child set has changed.
      expect(Object.keys(updates)).toContain('root');
    });
  });
});
