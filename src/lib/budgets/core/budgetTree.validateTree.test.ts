/**
 * Test suite for BudgetTree.validateTree()
 *
 * Test Strategy (ZOMBIES):
 *   Z – Zero: empty tree / nodes with no budgets → empty violation map
 *   O – One node with no violation
 *   O – One level: parent + children, violation flagged
 *   M – Multi-level tree: violations at deeper level
 *   B – Children sum exactly equals parent → no violation
 *   B – Multi-period: violation only in one time window
 *   I – Does not mutate the original tree
 *   I – Returns a merged map across all nodes
 *   S – All-disabled config → empty map despite violations
 */

import { describe, it, expect } from 'vitest';
import { BudgetTreeNode } from '@/lib/budgets/core/budgetNode';
import { BudgetInstance } from '@/lib/budgets/core/budgetInstance';
import { DateRange } from '@/lib/utils/dateRange';
import { NaiveDate } from '@/lib/utils/dateUtil';
import { makeAccountLabel } from '@/lib/budgets/core/accountLabel';
import { BudgetTree } from '@/lib/budgets/core/budgetTree';
import type { ConstraintConfig } from '@/lib/budgets/constraints/constraints';

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

function treeNode(label: string, instances: BudgetInstance[], children: BudgetTreeNode[]): BudgetTreeNode {
  return new BudgetTreeNode(makeAccountLabel(label), instances, children);
}

const ALL_WARNING: ConstraintConfig = {
  ParentChildrenSum: { parent: 'warning', child: 'warning' },
};

const ALL_DISABLED: ConstraintConfig = {
  ParentChildrenSum: { parent: 'disabled', child: 'disabled' },
};

// ─────────────────────────────────────────────────────────────────────────────

describe('BudgetTree.validateTree()', () => {

  // ── (Z) Zero ────────────────────────────────────────────────────────────────

  describe('(Z) empty / no-budget trees', () => {
    it('returns an empty map for an empty root with no budgets and no children', () => {
      const tree = BudgetTree.createEmpty(makeAccountLabel('Expenses'), ALL_WARNING);
      expect(tree.validateTree()).toEqual({});
    });

    it('returns an empty map when nodes have no BudgetInstances', () => {
      const child = treeNode('Expenses:Food', [], []);
      const root  = treeNode('Expenses', [], [child]);
      const tree  = new BudgetTree(root, ALL_WARNING);
      expect(tree.validateTree()).toEqual({});
    });
  });

  // ── (O) One level, no violation ─────────────────────────────────────────────

  describe('(O) single level, children within budget', () => {
    it('returns an empty map when children sum does not exceed parent', () => {
      const c1 = treeNode('Expenses:Food',      [inst('c1', '2026-01-01', '2026-12-31', 300)], []);
      const c2 = treeNode('Expenses:Transport', [inst('c2', '2026-01-01', '2026-12-31', 300)], []);
      const root = treeNode('Expenses', [inst('p1', '2026-01-01', '2026-12-31', 1000)], [c1, c2]);
      const tree = new BudgetTree(root, ALL_WARNING);

      expect(tree.validateTree()).toEqual({});
    });
  });

  // ── (O) One level, violation ────────────────────────────────────────────────

  describe('(O) single level, children exceed parent', () => {
    it('returns a non-empty ParentChildrenSum map with parent and child warnings', () => {
      const c1 = treeNode('Expenses:Food',      [inst('c1', '2026-01-01', '2026-12-31', 400)], []);
      const c2 = treeNode('Expenses:Transport', [inst('c2', '2026-01-01', '2026-12-31', 400)], []);
      // Parent = 500, children sum = 800 → overage = 300
      const root = treeNode('Expenses', [inst('p1', '2026-01-01', '2026-12-31', 500)], [c1, c2]);
      const tree = new BudgetTree(root, ALL_WARNING);

      const result = tree.validateTree();
      expect(result.ParentChildrenSum).toBeDefined();
      expect(result.ParentChildrenSum!.length).toBeGreaterThan(0);
    });

    it('includes the correct overageAmount in the parent-role warning', () => {
      const c1 = treeNode('Expenses:Food', [inst('c1', '2026-01-01', '2026-12-31', 800)], []);
      const root = treeNode('Expenses',    [inst('p1', '2026-01-01', '2026-12-31', 500)], [c1]);
      const tree = new BudgetTree(root, ALL_WARNING);

      const result = tree.validateTree();
      const parentWarn = result.ParentChildrenSum!.find(w => w.role === 'parent');
      expect(parentWarn).toBeDefined();
      expect(parentWarn!.overageAmount).toBe(300);
    });
  });

  // ── (M) Multi-level tree ────────────────────────────────────────────────────

  describe('(M) multi-level tree, violation at grandchild level', () => {
    it('detects violations at every level of a deep tree', () => {
      // Expenses: 1000 (OK vs Food:800+Transport:400=1200 → violation)
      // Expenses:Food: 800 (OK vs Restaurants:300+Groceries:300=600 → no violation)
      const rest  = treeNode('Expenses:Food:Restaurants', [inst('r1', '2026-01-01', '2026-12-31', 300)], []);
      const groc  = treeNode('Expenses:Food:Groceries',   [inst('g1', '2026-01-01', '2026-12-31', 300)], []);
      const food  = treeNode('Expenses:Food',      [inst('f1', '2026-01-01', '2026-12-31',  800)], [rest, groc]);
      const trans = treeNode('Expenses:Transport', [inst('t1', '2026-01-01', '2026-12-31',  400)], []);
      const root  = treeNode('Expenses', [inst('p1', '2026-01-01', '2026-12-31', 1000)], [food, trans]);
      const tree  = new BudgetTree(root, ALL_WARNING);

      const result = tree.validateTree();
      // violation only at root level (800+400 > 1000)
      expect(result.ParentChildrenSum).toBeDefined();
      const parentWarns = result.ParentChildrenSum!.filter(w => w.role === 'parent');
      expect(parentWarns).toHaveLength(1);
      expect(parentWarns[0]!.budgetId).toBe('p1');
    });

    it('accumulates violations from multiple levels when both are violated', () => {
      // Root: 100, child: 200 → root violated
      // Child: 200, grandchild: 300 → child violated
      const grand = treeNode('Expenses:Food:Restaurants', [inst('g1', '2026-01-01', '2026-12-31', 300)], []);
      const child = treeNode('Expenses:Food',   [inst('f1', '2026-01-01', '2026-12-31', 200)], [grand]);
      const root  = treeNode('Expenses', [inst('p1', '2026-01-01', '2026-12-31', 100)], [child]);
      const tree  = new BudgetTree(root, ALL_WARNING);

      const result = tree.validateTree();
      const parentWarns = result.ParentChildrenSum!.filter(w => w.role === 'parent');
      expect(parentWarns).toHaveLength(2); // one for root, one for child
    });
  });

  // ── (B) Boundary: exact equality ──────────────────────────────────────────

  describe('(B) children sum exactly equals parent — no violation', () => {
    it('returns empty map when sum equals parent exactly', () => {
      const c1 = treeNode('Expenses:Food',      [inst('c1', '2026-01-01', '2026-12-31', 400)], []);
      const c2 = treeNode('Expenses:Transport', [inst('c2', '2026-01-01', '2026-12-31', 300)], []);
      const root = treeNode('Expenses', [inst('p1', '2026-01-01', '2026-12-31', 700)], [c1, c2]);
      const tree = new BudgetTree(root, ALL_WARNING);

      expect(tree.validateTree()).toEqual({});
    });
  });

  // ── (B) Multi-period: violation in only one window ────────────────────────

  describe('(B) multi-period: violation only in one time period', () => {
    it('flags only the period where children exceed parent', () => {
      // Parent has two instances: Jan–Jun (amount=500) and Jul–Dec (amount=100)
      // Child has two instances:  Jan–Jun (amount=100) and Jul–Dec (amount=900)
      // Only the Jul–Dec window violates
      const child = treeNode('Expenses:Food', [
        inst('c1', '2026-01-01', '2026-06-30', 100),
        inst('c2', '2026-07-01', '2026-12-31', 900),
      ], []);
      const root = treeNode('Expenses', [
        inst('p1', '2026-01-01', '2026-06-30', 500),
        inst('p2', '2026-07-01', '2026-12-31', 100),
      ], [child]);
      const tree = new BudgetTree(root, ALL_WARNING);

      const result = tree.validateTree();
      const parentWarns = result.ParentChildrenSum!.filter(w => w.role === 'parent');
      expect(parentWarns).toHaveLength(1);
      expect(parentWarns[0]!.budgetId).toBe('p2');
      expect(parentWarns[0]!.overageAmount).toBe(800);
    });
  });

  // ── (I) Immutability ────────────────────────────────────────────────────────

  describe('(I) immutability', () => {
    it('does not mutate the BudgetTree', () => {
      const c1 = treeNode('Expenses:Food', [inst('c1', '2026-01-01', '2026-12-31', 999)], []);
      const root = treeNode('Expenses', [inst('p1', '2026-01-01', '2026-12-31', 1)], [c1]);
      const tree = new BudgetTree(root, ALL_WARNING);
      const rootBefore = tree.root;

      tree.validateTree();

      expect(tree.root).toBe(rootBefore);
    });
  });

  // ── (S) All disabled ────────────────────────────────────────────────────────

  describe('(S) all constraints disabled', () => {
    it('returns empty map when all constraint modes are disabled despite a clear violation', () => {
      const c1 = treeNode('Expenses:Food', [inst('c1', '2026-01-01', '2026-12-31', 9999)], []);
      const root = treeNode('Expenses', [inst('p1', '2026-01-01', '2026-12-31', 1)], [c1]);
      const tree = new BudgetTree(root, ALL_DISABLED);

      expect(tree.validateTree()).toEqual({});
    });
  });
});
