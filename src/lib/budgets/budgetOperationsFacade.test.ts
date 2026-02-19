/**
 * Test suite for BudgetFacade.initializeBudgets
 *
 * Test Strategy (ZOMBIES):
 *   Z – Zero: empty input
 *   O – One: single budget, various constraint configs
 *   M – Many: parent/child hierarchies with and without violations
 *   B – Boundary: exact-equality amounts, open-ended dates
 *   I – Interface: field pass-through, immutability, idempotency
 *   E – Exceptions: invalid amounts, constraint mode combinations
 *   S – Simple: all-disabled config produces no warnings
 */

import { describe, it, expect } from 'vitest';
import type { StandardBudgetOutput } from '@/lib/types';
import type { ConstraintConfig } from '@/lib/budgets/constraints';
import type { BudgetFacade } from '@/lib/budgets/budgetOperationsFacade';
// TODO: replace with real import once the implementation file is created
// import { createBudgetFacade } from '@/lib/budgets/budgetFacadeImpl';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers / fixture factories
// ─────────────────────────────────────────────────────────────────────────────

/** Build a minimal valid StandardBudgetOutput. Omitted fields use safe defaults. */
function rawBudget(
  overrides: Partial<StandardBudgetOutput> & Pick<StandardBudgetOutput, 'id' | 'account' | 'amount' | 'start_date' | 'frequency'>,
): StandardBudgetOutput {
  return {
    currency: 'CAD',
    tags: [],
    created_at: null,
    end_date: null,
    ...overrides,
  };
}

/** ConstraintConfig presets */
const ALL_DISABLED: ConstraintConfig = {
  ParentChildrenSum: { parent: 'disabled', child: 'disabled' },
};

const ALL_WARNING: ConstraintConfig = {
  ParentChildrenSum: { parent: 'warning', child: 'warning' },
};

/** Only the parent node gets a warning; child warnings are suppressed. */
const PARENT_WARNING_ONLY: ConstraintConfig = {
  ParentChildrenSum: { parent: 'warning', child: 'disabled' },
};

/** Only the child nodes get a warning; parent warning is suppressed. */
const CHILD_WARNING_ONLY: ConstraintConfig = {
  ParentChildrenSum: { parent: 'disabled', child: 'warning' },
};

// ─────────────────────────────────────────────────────────────────────────────
// The facade must be constructed fresh per test to avoid shared state.
// ─────────────────────────────────────────────────────────────────────────────

/** Placeholder — will be replaced by the real implementation. */
function createBudgetFacade(): BudgetFacade {
  // Once real implementation exists, import and call the factory here.
  // For now all tests are expected to FAIL because the impl doesn't exist.
  throw new Error('NOT IMPLEMENTED — replace with real import');
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('BudgetFacade.initializeBudgets', () => {

  // ── (Z) Zero ───────────────────────────────────────────────────────────────

  describe('(Z) empty input', () => {
    it('returns an empty array for empty input', () => {
      const facade = createBudgetFacade();
      const result = facade.initializeBudgets([], ALL_DISABLED);
      expect(result).toEqual([]);
    });

    it('returns an empty array regardless of constraint config', () => {
      const facade = createBudgetFacade();
      expect(facade.initializeBudgets([], ALL_WARNING)).toEqual([]);
    });
  });

  // ── (S) Simple / (I) Interface — field pass-through ───────────────────────

  describe('(S/I) field pass-through', () => {
    it('preserves all StandardBudgetOutput fields on the returned ExtendedBudget', () => {
      const facade = createBudgetFacade();
      const raw = rawBudget({
        id: 'b1',
        account: 'Expenses:Food',
        amount: '500.00',
        start_date: '2026-01-01',
        frequency: 'monthly',
        currency: 'EUR',
        tags: ['groceries'],
        created_at: 1234567890,
        end_date: '2026-12-31',
      });

      const [result] = facade.initializeBudgets([raw], ALL_DISABLED);

      expect(result!.id).toBe('b1');
      expect(result!.account).toBe('Expenses:Food');
      expect(result!.amount).toBe('500.00');
      expect(result!.start_date).toBe('2026-01-01');
      expect(result!.frequency).toBe('monthly');
      expect(result!.currency).toBe('EUR');
      expect(result!.tags).toEqual(['groceries']);
      expect(result!.created_at).toBe(1234567890);
      expect(result!.end_date).toBe('2026-12-31');
    });

    it('preserves the order of the input array in the output', () => {
      const facade = createBudgetFacade();
      const b1 = rawBudget({ id: 'b1', account: 'Expenses', amount: '1000', start_date: '2026-01-01', frequency: 'monthly' });
      const b2 = rawBudget({ id: 'b2', account: 'Expenses:Food', amount: '400', start_date: '2026-01-01', frequency: 'monthly' });
      const b3 = rawBudget({ id: 'b3', account: 'Expenses:Transport', amount: '300', start_date: '2026-01-01', frequency: 'monthly' });

      const result = facade.initializeBudgets([b1, b2, b3], ALL_DISABLED);

      expect(result.map((r) => r.id)).toEqual(['b1', 'b2', 'b3']);
    });

    it('returns an ExtendedBudget with a warnings field for every budget', () => {
      const facade = createBudgetFacade();
      const raw = rawBudget({ id: 'b1', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly' });
      const [result] = facade.initializeBudgets([raw], ALL_DISABLED);
      expect(result).toHaveProperty('warnings');
    });
  });

  // ── (I) Immutability ───────────────────────────────────────────────────────

  describe('(I) immutability', () => {
    it('does not mutate the input array', () => {
      const facade = createBudgetFacade();
      const raw = rawBudget({ id: 'b1', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly' });
      const input = [raw];
      facade.initializeBudgets(input, ALL_DISABLED);
      expect(input).toHaveLength(1);
      expect(input[0]).toBe(raw); // original reference untouched
    });

    it('returns a new array and new objects, not references to the inputs', () => {
      // The output must be fresh objects so UI can safely spread/compare them.
      const facade = createBudgetFacade();
      const raws = [
        rawBudget({ id: 'b1', account: 'Expenses', amount: '1000', start_date: '2026-01-01', frequency: 'monthly' }),
        rawBudget({ id: 'b2', account: 'Expenses:Food', amount: '400', start_date: '2026-01-01', frequency: 'monthly' }),
      ];
      const result = facade.initializeBudgets(raws, ALL_DISABLED);
      expect(result).not.toBe(raws);          // different array instance
      expect(result[0]).not.toBe(raws[0]);    // different object instances
    });
  });

  // ── (O) One budget, no siblings / children ─────────────────────────────────

  describe('(O) single budget', () => {
    it('produces no warnings for a lone budget with all constraints disabled', () => {
      const facade = createBudgetFacade();
      const raw = rawBudget({ id: 'b1', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly' });
      const [result] = facade.initializeBudgets([raw], ALL_DISABLED);
      expect(result!.warnings).toEqual({});
    });

    it('produces no warnings for a lone budget even with all constraints on warning mode', () => {
      // A single budget has no parent/children to violate against.
      const facade = createBudgetFacade();
      const raw = rawBudget({ id: 'b1', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'monthly' });
      const [result] = facade.initializeBudgets([raw], ALL_WARNING);
      expect(result!.warnings).toEqual({});
    });
  });

  // ── (S) All constraints disabled ───────────────────────────────────────────

  describe('(S) all constraints disabled', () => {
    it('produces no warnings for a clear violation when all roles are disabled', () => {
      const facade = createBudgetFacade();
      // Parent = 100, children sum = 600 → violation, but disabled
      const parent = rawBudget({ id: 'p', account: 'Expenses', amount: '100', start_date: '2026-01-01', frequency: 'monthly' });
      const child1 = rawBudget({ id: 'c1', account: 'Expenses:Food', amount: '300', start_date: '2026-01-01', frequency: 'monthly' });
      const child2 = rawBudget({ id: 'c2', account: 'Expenses:Transport', amount: '300', start_date: '2026-01-01', frequency: 'monthly' });

      const results = facade.initializeBudgets([parent, child1, child2], ALL_DISABLED);
      for (const r of results) {
        expect(r.warnings).toEqual({});
      }
    });
  });

  // ── (M) Parent + children, no violation ───────────────────────────────────

  describe('(M) parent + children, no violation', () => {
    it('produces no warnings when parent amount >= sum of children', () => {
      const facade = createBudgetFacade();
      const parent = rawBudget({ id: 'p', account: 'Expenses', amount: '1000', start_date: '2026-01-01', frequency: 'monthly' });
      const child1 = rawBudget({ id: 'c1', account: 'Expenses:Food', amount: '400', start_date: '2026-01-01', frequency: 'monthly' });
      const child2 = rawBudget({ id: 'c2', account: 'Expenses:Transport', amount: '300', start_date: '2026-01-01', frequency: 'monthly' });

      const results = facade.initializeBudgets([parent, child1, child2], ALL_WARNING);
      for (const r of results) {
        expect(r.warnings).toEqual({});
      }
    });
  });

  // ── (B) Boundary: exact equality ──────────────────────────────────────────

  describe('(B) boundary: parent amount exactly equals sum of children', () => {
    it('produces no warnings when parent = sum of children (not a violation)', () => {
      const facade = createBudgetFacade();
      const parent = rawBudget({ id: 'p', account: 'Expenses', amount: '700', start_date: '2026-01-01', frequency: 'monthly' });
      const child1 = rawBudget({ id: 'c1', account: 'Expenses:Food', amount: '400', start_date: '2026-01-01', frequency: 'monthly' });
      const child2 = rawBudget({ id: 'c2', account: 'Expenses:Transport', amount: '300', start_date: '2026-01-01', frequency: 'monthly' });

      const results = facade.initializeBudgets([parent, child1, child2], ALL_WARNING);
      for (const r of results) {
        expect(r.warnings).toEqual({});
      }
    });
  });

  // ── (M) ParentChildrenSum constraint ──────────────────────────────────────
  // A single constraint governing both the parent and child roles.
  // Config: { parent: mode, child: mode } — each role is independently toggled.
  // Fires when children collectively EXCEED the parent budget amount.

  describe('(M) ParentChildrenSum constraint — parent role', () => {
    it('attaches a role:"parent" warning when children sum exceeds the parent', () => {
      // Parent = 500, children sum = 600 → overage of 100.
      const facade = createBudgetFacade();
      const parent = rawBudget({ id: 'p',  account: 'Expenses',           amount: '500', start_date: '2026-01-01', frequency: 'monthly' });
      const child1 = rawBudget({ id: 'c1', account: 'Expenses:Food',      amount: '300', start_date: '2026-01-01', frequency: 'monthly' });
      const child2 = rawBudget({ id: 'c2', account: 'Expenses:Transport', amount: '300', start_date: '2026-01-01', frequency: 'monthly' });

      const results = facade.initializeBudgets([parent, child1, child2], PARENT_WARNING_ONLY);
      const parentResult = results.find((r) => r.id === 'p')!;

      expect(parentResult.warnings.ParentChildrenSum).toBeDefined();
      const parentWarning = parentResult.warnings.ParentChildrenSum!.find((w) => w.role === 'parent');
      expect(parentWarning).toBeDefined();
      expect(parentWarning!.role).toBe('parent');
      // children sum = 600, parent = 500 → overage = 100
      expect(parentWarning!.overageAmount).toBe(100);
      expect(parentWarning!.exceedingChildIds).toContain('c1');
      expect(parentWarning!.exceedingChildIds).toContain('c2');
    });

    it('does not attach a parent-role warning when children are within budget', () => {
      const facade = createBudgetFacade();
      const parent = rawBudget({ id: 'p',  account: 'Expenses',      amount: '1000', start_date: '2026-01-01', frequency: 'monthly' });
      const child  = rawBudget({ id: 'c1', account: 'Expenses:Food', amount: '400',  start_date: '2026-01-01', frequency: 'monthly' });

      const results = facade.initializeBudgets([parent, child], PARENT_WARNING_ONLY);
      for (const r of results) {
        expect(r.warnings.ParentChildrenSum).toBeUndefined();
      }
    });

    it('suppresses parent-role warnings when parent mode is disabled', () => {
      // Clear violation, but parent mode is off — only child mode is on.
      const facade = createBudgetFacade();
      const parent = rawBudget({ id: 'p',  account: 'Expenses',      amount: '100', start_date: '2026-01-01', frequency: 'monthly' });
      const child  = rawBudget({ id: 'c1', account: 'Expenses:Food', amount: '999', start_date: '2026-01-01', frequency: 'monthly' });

      const results = facade.initializeBudgets([parent, child], CHILD_WARNING_ONLY);
      const parentResult = results.find((r) => r.id === 'p')!;
      const parentWarning = parentResult.warnings.ParentChildrenSum?.find((w) => w.role === 'parent');
      expect(parentWarning).toBeUndefined();
    });
  });

  describe('(M) ParentChildrenSum constraint — child role', () => {
    it('attaches a role:"child" warning to each exceeding child', () => {
      // Parent = 500, children sum = 600.
      const facade = createBudgetFacade();
      const parent = rawBudget({ id: 'p',  account: 'Expenses',           amount: '500', start_date: '2026-01-01', frequency: 'monthly' });
      const child1 = rawBudget({ id: 'c1', account: 'Expenses:Food',      amount: '300', start_date: '2026-01-01', frequency: 'monthly' });
      const child2 = rawBudget({ id: 'c2', account: 'Expenses:Transport', amount: '300', start_date: '2026-01-01', frequency: 'monthly' });

      const results = facade.initializeBudgets([parent, child1, child2], CHILD_WARNING_ONLY);

      for (const childId of ['c1', 'c2']) {
        const childResult = results.find((r) => r.id === childId)!;
        expect(childResult.warnings.ParentChildrenSum).toBeDefined();
        const childWarning = childResult.warnings.ParentChildrenSum!.find((w) => w.role === 'child');
        expect(childWarning).toBeDefined();
        expect(childWarning!.role).toBe('child');
        expect(childWarning!.parentId).toBe('p');
      }
    });

    it('suppresses child-role warnings when child mode is disabled', () => {
      // Clear violation, but child mode is off — only parent mode is on.
      const facade = createBudgetFacade();
      const parent = rawBudget({ id: 'p',  account: 'Expenses',      amount: '100', start_date: '2026-01-01', frequency: 'monthly' });
      const child  = rawBudget({ id: 'c1', account: 'Expenses:Food', amount: '999', start_date: '2026-01-01', frequency: 'monthly' });

      const results = facade.initializeBudgets([parent, child], PARENT_WARNING_ONLY);
      const childResult = results.find((r) => r.id === 'c1')!;
      const childWarning = childResult.warnings.ParentChildrenSum?.find((w) => w.role === 'child');
      expect(childWarning).toBeUndefined();
    });
  });

  describe('(M) ParentChildrenSum constraint — both roles in ALL_DISABLED', () => {
    it('produces no warnings when both roles are disabled despite a violation', () => {
      const facade = createBudgetFacade();
      const parent = rawBudget({ id: 'p',  account: 'Expenses',           amount: '400', start_date: '2026-01-01', frequency: 'monthly' });
      const child1 = rawBudget({ id: 'c1', account: 'Expenses:Food',      amount: '500', start_date: '2026-01-01', frequency: 'monthly' });
      const child2 = rawBudget({ id: 'c2', account: 'Expenses:Transport', amount: '300', start_date: '2026-01-01', frequency: 'monthly' });

      const results = facade.initializeBudgets([parent, child1, child2], ALL_DISABLED);
      for (const r of results) {
        expect(r.warnings).toEqual({});
      }
    });
  });

  // ── (M) both roles on the same node ───────────────────────────────────────

  describe('(M) both parent-role and child-role warnings on the same node', () => {
    it('attaches both role warnings to a middle node that violates up AND down', () => {
      // Three-level subtree: grandparent → parent → child.
      //   gp = 100,  parent = 200  → parent EXCEEDS gp  → parent gets child-role warning
      //   parent = 200, child = 300 → child EXCEEDS parent → parent gets parent-role warning
      // The middle node 'p' should hold both role variants in ParentChildrenSum.
      const facade = createBudgetFacade();
      const gp     = rawBudget({ id: 'gp', account: 'Expenses',                  amount: '100', start_date: '2026-01-01', frequency: 'monthly' });
      const parent = rawBudget({ id: 'p',  account: 'Expenses:Food',             amount: '200', start_date: '2026-01-01', frequency: 'monthly' });
      const child  = rawBudget({ id: 'c',  account: 'Expenses:Food:Restaurants', amount: '300', start_date: '2026-01-01', frequency: 'monthly' });

      const results = facade.initializeBudgets([gp, parent, child], ALL_WARNING);
      const parentResult = results.find((r) => r.id === 'p')!;

      const warnings = parentResult.warnings.ParentChildrenSum ?? [];
      // parent exceeds gp → parent has a child-role warning
      expect(warnings.some((w) => w.role === 'child')).toBe(true);
      // child exceeds parent → parent has a parent-role warning
      expect(warnings.some((w) => w.role === 'parent')).toBe(true);
    });
  });

  // ── (B) Open-ended budgets (end_date: null) ────────────────────────────────

  describe('(B) open-ended date ranges', () => {
    it('handles budgets with end_date: null without throwing', () => {
      const facade = createBudgetFacade();
      const parent = rawBudget({ id: 'p', account: 'Expenses', amount: '1000', start_date: '2026-01-01', frequency: 'yearly', end_date: null });
      const child  = rawBudget({ id: 'c', account: 'Expenses:Food', amount: '400', start_date: '2026-01-01', frequency: 'yearly', end_date: null });

      expect(() => facade.initializeBudgets([parent, child], ALL_WARNING)).not.toThrow();
    });

    it('correctly detects violations for open-ended budgets', () => {
      const facade = createBudgetFacade();
      // Parent 500, child 800 → violation even with open-ended ranges
      const parent = rawBudget({ id: 'p', account: 'Expenses', amount: '500', start_date: '2026-01-01', frequency: 'yearly', end_date: null });
      const child  = rawBudget({ id: 'c', account: 'Expenses:Food', amount: '800', start_date: '2026-01-01', frequency: 'yearly', end_date: null });

      const results = facade.initializeBudgets([parent, child], PARENT_WARNING_ONLY);
      const parentResult = results.find((r) => r.id === 'p')!;
      expect(parentResult.warnings.ParentChildrenSum).toBeDefined();
    });
  });

  // ── (M) deep hierarchy ────────────────────────────────────────────────────

  describe('(M) deep three-level hierarchy, no violations', () => {
    it('correctly evaluates constraints at each level of a 3-level tree', () => {
      const facade = createBudgetFacade();
      // Expenses: 1000
      //   Expenses:Food: 600
      //     Expenses:Food:Restaurants: 250
      //     Expenses:Food:Groceries: 350
      //   Expenses:Transport: 400
      const raws = [
        rawBudget({ id: 'root',  account: 'Expenses',                    amount: '1000', start_date: '2026-01-01', frequency: 'monthly' }),
        rawBudget({ id: 'food',  account: 'Expenses:Food',               amount: '600',  start_date: '2026-01-01', frequency: 'monthly' }),
        rawBudget({ id: 'rest',  account: 'Expenses:Food:Restaurants',   amount: '250',  start_date: '2026-01-01', frequency: 'monthly' }),
        rawBudget({ id: 'groc',  account: 'Expenses:Food:Groceries',     amount: '350',  start_date: '2026-01-01', frequency: 'monthly' }),
        rawBudget({ id: 'trans', account: 'Expenses:Transport',          amount: '400',  start_date: '2026-01-01', frequency: 'monthly' }),
      ];

      const results = facade.initializeBudgets(raws, ALL_WARNING);
      for (const r of results) {
        expect(r.warnings).toEqual({});
      }
    });
  });
});
