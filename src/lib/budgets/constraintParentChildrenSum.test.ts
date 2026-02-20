/**
 * Test suite for checkParentChildrenSum
 *
 * Test Strategy (ZOMBIES):
 *   Z – Zero: node with no children → no violation
 *   O – One child, below budget → no violation
 *   O – One child, exceeds budget → violation with correct overage
 *   M – Multiple children whose combined sum exceeds parent
 *   B – Children sum exactly equals parent → no violation
 *   B – Partially overlapping date ranges → only overlapping instances compared
 *   E – Config: parent disabled suppresses parent warning
 *   E – Config: child disabled suppresses child warnings
 *   E – Config: both disabled → no warnings despite clear violation
 *   I – overageAmount, exceedingChildIds, parentId are populated correctly
 */

import { describe, it, expect } from 'vitest';
import { BudgetTreeNode } from '@/lib/budgets/budgetNode';
import { BudgetInstance } from '@/lib/budgets/budgetInstance';
import { DateRange } from '@/lib/budgets/dateRange';
import { NaiveDate } from '@/lib/budgets/dateUtil';
import { makeAccountLabel } from '@/lib/budgets/accountLabel';
import type { ConstraintRegistry } from '@/lib/budgets/constraints';
import { checkParentChildrenSum } from './constraintParentChildrenSum';

// ── helpers ──────────────────────────────────────────────────────────────────

function d(s: string): NaiveDate {
  return NaiveDate.fromString(s);
}

function range(start: string, end: string | null = null): DateRange {
  return new DateRange(d(start), end === null ? null : d(end));
}

function inst(id: string, start: string, end: string | null, amount: number): BudgetInstance {
  return new BudgetInstance(range(start, end), amount, id);
}

function node(label: string, instances: BudgetInstance[], children: BudgetTreeNode[]): BudgetTreeNode {
  return new BudgetTreeNode(makeAccountLabel(label), instances, children);
}

type PCSConfig = ConstraintRegistry['ParentChildrenSum']['Config'];

const ALL_WARNING:  PCSConfig = { parent: 'warning',  child: 'warning'  };
const ALL_DISABLED: PCSConfig = { parent: 'disabled', child: 'disabled' };
const PARENT_ONLY:  PCSConfig = { parent: 'warning',  child: 'disabled' };
const CHILD_ONLY:   PCSConfig = { parent: 'disabled', child: 'warning'  };

// ─────────────────────────────────────────────────────────────────────────────

describe('checkParentChildrenSum', () => {

  // ── (Z) Zero children ─────────────────────────────────────────────────────

  describe('(Z) no children', () => {
    it('returns an empty map when the node has no children', () => {
      const parent = node('Expenses', [inst('p1', '2026-01-01', '2026-12-31', 500)], []);
      expect(checkParentChildrenSum(parent, ALL_WARNING)).toEqual({});
    });

    it('returns an empty map when the node has no budget instances at all', () => {
      const parent = node('Expenses', [], []);
      expect(checkParentChildrenSum(parent, ALL_WARNING)).toEqual({});
    });
  });

  // ── (O) One child ─────────────────────────────────────────────────────────

  describe('(O) one child within budget', () => {
    it('returns empty map when the single child is within the parent budget', () => {
      const child  = node('Expenses:Food', [inst('c1', '2026-01-01', '2026-12-31', 400)], []);
      const parent = node('Expenses',      [inst('p1', '2026-01-01', '2026-12-31', 500)], [child]);
      expect(checkParentChildrenSum(parent, ALL_WARNING)).toEqual({});
    });
  });

  describe('(O) one child exceeds budget', () => {
    it('fires a parent-role warning with correct overageAmount', () => {
      const child  = node('Expenses:Food', [inst('c1', '2026-01-01', '2026-12-31', 800)], []);
      const parent = node('Expenses',      [inst('p1', '2026-01-01', '2026-12-31', 500)], [child]);

      const result = checkParentChildrenSum(parent, ALL_WARNING);

      expect(result.ParentChildrenSum).toBeDefined();
      const parentWarning = result.ParentChildrenSum!.find(w => w.role === 'parent');
      expect(parentWarning).toBeDefined();
      expect(parentWarning!.overageAmount).toBe(300);
    });

    it('fires a child-role warning referencing the parent instance id', () => {
      const child  = node('Expenses:Food', [inst('c1', '2026-01-01', '2026-12-31', 800)], []);
      const parent = node('Expenses',      [inst('p1', '2026-01-01', '2026-12-31', 500)], [child]);

      const result = checkParentChildrenSum(parent, ALL_WARNING);

      const childWarning = result.ParentChildrenSum!.find(w => w.role === 'child');
      expect(childWarning).toBeDefined();
      expect(childWarning!.parentId).toBe('p1');
      expect(childWarning!.budgetId).toBe('c1');
    });
  });

  // ── (M) Many children ─────────────────────────────────────────────────────

  describe('(M) multiple children exceeding parent', () => {
    it('lists all child ids in exceedingChildIds', () => {
      const c1 = node('Expenses:Food',      [inst('c1', '2026-01-01', '2026-12-31', 300)], []);
      const c2 = node('Expenses:Transport', [inst('c2', '2026-01-01', '2026-12-31', 300)], []);
      const parent = node('Expenses', [inst('p1', '2026-01-01', '2026-12-31', 500)], [c1, c2]);
      // childrenSum = 600, parent = 500, overage = 100

      const result = checkParentChildrenSum(parent, ALL_WARNING);

      const parentWarn = result.ParentChildrenSum!.find(w => w.role === 'parent')!;
      expect(parentWarn.exceedingChildIds).toContain('c1');
      expect(parentWarn.exceedingChildIds).toContain('c2');
      expect(parentWarn.overageAmount).toBe(100);
    });

    it('attaches a child-role warning to each individual child instance', () => {
      const c1 = node('Expenses:Food',      [inst('c1', '2026-01-01', '2026-12-31', 300)], []);
      const c2 = node('Expenses:Transport', [inst('c2', '2026-01-01', '2026-12-31', 300)], []);
      const parent = node('Expenses', [inst('p1', '2026-01-01', '2026-12-31', 500)], [c1, c2]);

      const result = checkParentChildrenSum(parent, ALL_WARNING);

      const childWarnings = result.ParentChildrenSum!.filter(w => w.role === 'child');
      const childIds = childWarnings.map(w => w.budgetId);
      expect(childIds).toContain('c1');
      expect(childIds).toContain('c2');
    });
  });

  // ── (B) Boundary: exact equality ──────────────────────────────────────────

  describe('(B) children sum exactly equals parent', () => {
    it('returns empty map when childrenSum === parent (equality is not a violation)', () => {
      const c1 = node('Expenses:Food',      [inst('c1', '2026-01-01', '2026-12-31', 400)], []);
      const c2 = node('Expenses:Transport', [inst('c2', '2026-01-01', '2026-12-31', 300)], []);
      const parent = node('Expenses', [inst('p1', '2026-01-01', '2026-12-31', 700)], [c1, c2]);

      expect(checkParentChildrenSum(parent, ALL_WARNING)).toEqual({});
    });
  });

  // ── (B) Boundary: non-overlapping date ranges ──────────────────────────────

  describe('(B) non-overlapping date ranges between parent and child instances', () => {
    it('does not flag a violation when parent and child instances have no date overlap', () => {
      // Parent covers Jan, child covers Jul–Dec → no temporal overlap → no violation
      const child  = node('Expenses:Food', [inst('c1', '2026-07-01', '2026-12-31', 9999)], []);
      const parent = node('Expenses',      [inst('p1', '2026-01-01', '2026-06-30',   100)], [child]);

      expect(checkParentChildrenSum(parent, ALL_WARNING)).toEqual({});
    });

    it('only compares child instances that overlap the parent instance range', () => {
      // Parent Jan–Jun (amount 100). Child has: Jan–Jun (50) and Jul–Dec (9999).
      // Only the Jan–Jun child instance should count; 50 ≤ 100 → no violation.
      const child  = node('Expenses:Food', [
        inst('c1a', '2026-01-01', '2026-06-30',   50),
        inst('c1b', '2026-07-01', '2026-12-31', 9999),
      ], []);
      const parent = node('Expenses', [inst('p1', '2026-01-01', '2026-06-30', 100)], [child]);

      expect(checkParentChildrenSum(parent, ALL_WARNING)).toEqual({});
    });
  });

  // ── (E) Config mode combinations ──────────────────────────────────────────

  describe('(E) config: parent disabled', () => {
    it('suppresses parent-role warning when parent mode is disabled', () => {
      const child  = node('Expenses:Food', [inst('c1', '2026-01-01', '2026-12-31', 999)], []);
      const parent = node('Expenses',      [inst('p1', '2026-01-01', '2026-12-31', 100)], [child]);

      const result = checkParentChildrenSum(parent, PARENT_ONLY);
      // parent warning should exist, but NOT child warning
      const childWarn = result.ParentChildrenSum?.find(w => w.role === 'child');
      expect(childWarn).toBeUndefined();
    });

    it('still emits parent-role warning when parent mode is warning', () => {
      const child  = node('Expenses:Food', [inst('c1', '2026-01-01', '2026-12-31', 999)], []);
      const parent = node('Expenses',      [inst('p1', '2026-01-01', '2026-12-31', 100)], [child]);

      const result = checkParentChildrenSum(parent, PARENT_ONLY);
      const parentWarn = result.ParentChildrenSum?.find(w => w.role === 'parent');
      expect(parentWarn).toBeDefined();
    });
  });

  describe('(E) config: child disabled', () => {
    it('suppresses child-role warnings when child mode is disabled', () => {
      const child  = node('Expenses:Food', [inst('c1', '2026-01-01', '2026-12-31', 999)], []);
      const parent = node('Expenses',      [inst('p1', '2026-01-01', '2026-12-31', 100)], [child]);

      const result = checkParentChildrenSum(parent, CHILD_ONLY);
      const parentWarn = result.ParentChildrenSum?.find(w => w.role === 'parent');
      expect(parentWarn).toBeUndefined();
    });
  });

  describe('(E) config: both disabled', () => {
    it('returns an empty map despite a clear violation', () => {
      const child  = node('Expenses:Food', [inst('c1', '2026-01-01', '2026-12-31', 9999)], []);
      const parent = node('Expenses',      [inst('p1', '2026-01-01', '2026-12-31',    1)], [child]);

      expect(checkParentChildrenSum(parent, ALL_DISABLED)).toEqual({});
    });
  });

  // ── (I) Interface: budgetId in parent warning ──────────────────────────────

  describe('(I) interface correctness', () => {
    it('parent warning budgetId matches the parent BudgetInstance id', () => {
      const child  = node('Expenses:Food', [inst('child-inst-1', '2026-01-01', '2026-12-31', 999)], []);
      const parent = node('Expenses',      [inst('parent-inst-1', '2026-01-01', '2026-12-31', 100)], [child]);

      const result = checkParentChildrenSum(parent, ALL_WARNING);
      const parentWarn = result.ParentChildrenSum!.find(w => w.role === 'parent')!;
      expect(parentWarn.budgetId).toBe('parent-inst-1');
    });

    it('parent has multiple instances, each checked independently', () => {
      // Parent has two non-overlapping instances:
      //   Jan–Jun amount=100, child Jan–Jun amount=50 → no violation
      //   Jul–Dec amount=100, child Jul–Dec amount=200 → violation
      const child  = node('Expenses:Food', [
        inst('c1', '2026-01-01', '2026-06-30',  50),
        inst('c2', '2026-07-01', '2026-12-31', 200),
      ], []);
      const parent = node('Expenses', [
        inst('p1', '2026-01-01', '2026-06-30', 100),
        inst('p2', '2026-07-01', '2026-12-31', 100),
      ], [child]);

      const result = checkParentChildrenSum(parent, ALL_WARNING);
      expect(result.ParentChildrenSum).toBeDefined();
      // only violations for p2/c2 — overage = 100
      const parentWarns = result.ParentChildrenSum!.filter(w => w.role === 'parent');
      expect(parentWarns).toHaveLength(1);
      expect(parentWarns[0]!.budgetId).toBe('p2');
      expect(parentWarns[0]!.overageAmount).toBe(100);
    });
  });
});
