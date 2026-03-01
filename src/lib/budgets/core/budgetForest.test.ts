/**
 * Test suite for {@link BudgetForest.buildUnifiedTree}
 *
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  NEW UNIFIED TREE STRUCTURE                                               ║
 * ║                                                                           ║
 * ║  Each account segment gets the FULL period chain (yearly:quarterly:       ║
 * ║  monthly) inserted after it, except the leaf which gets only the          ║
 * ║  period-specific suffix.                                                  ║
 * ║                                                                           ║
 * ║  KEY RULE:                                                                ║
 * ║    Leaf segment  → PERIOD_PATH_SUFFIX[period]                             ║
 * ║    Intermediate  → yearly:quarterly:monthly   (always full chain)         ║
 * ║                                                                           ║
 * ║  Examples:                                                                ║
 * ║    Expenses         (yearly)  → Expenses:yearly                           ║
 * ║    Expenses         (monthly) → Expenses:yearly:quarterly:monthly         ║
 * ║    Expenses:Food    (yearly)  → Expenses:yearly:quarterly:monthly         ║
 * ║                                  :Food:yearly                             ║
 * ║    Expenses:Food    (monthly) → Expenses:yearly:quarterly:monthly         ║
 * ║                                  :Food:yearly:quarterly:monthly           ║
 * ║                                                                           ║
 * ║  CRITICAL PROPERTY: child accounts nest INSIDE parent period nodes.       ║
 * ║  Expenses:Food:monthly is a descendant of Expenses:monthly, so the        ║
 * ║  constraint checker can reach it via collectClosestBudgets.               ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ZOMBIES coverage:
 *   Z – empty forest → null
 *   O – single budget per period (single + multi-segment accounts)
 *   M – multi-period same account; parent+child accounts across periods
 *   B – single-segment account; sibling accounts
 *   I – returns BudgetTree; instanceof checks
 *   E – only yearly inserted → no quarterly/monthly below it
 *   S – simplest non-trivial: single mono-segment account
 */

import { describe, it, expect } from 'vitest';
import { BudgetForest } from './budgetForest';
import { BudgetInstance } from './budgetInstance';
import { BudgetTree } from './budgetTree';
import type { TreeNode } from './budgetNode';
import { makeAccountLabel, type AccountLabel } from './accountLabel';
import { DateRange } from '@/lib/utils/dateRange';
import { NaiveDate } from '@/lib/utils/dateUtil';
import type { ConstraintConfig } from '../constraints/constraints';

// ─── helpers ─────────────────────────────────────────────────────────────────

const CONFIG: ConstraintConfig = {
  ParentChildrenSum: { parent: 'warning', child_same_freq: 'blocking', child_lower_freq: 'warning', child_higher_freq: 'blocking' },
};

let idCounter = 0;
function makeBudget(amount: number): BudgetInstance {
  const start = NaiveDate.fromString('2026-01-01');
  return new BudgetInstance(new DateRange(start, null), amount, `id-${++idCounter}`);
}

/** Walk a unified BudgetTree to find the node at the given colon-separated path. */
function findNode(tree: BudgetTree, path: string): TreeNode | undefined {
  const target = makeAccountLabel(path);
  return findNodeByLabel(tree.root, target);
}

function findNodeByLabel(node: TreeNode, target: AccountLabel): TreeNode | undefined {
  if (
    node.accountLabel.length === target.length &&
    node.accountLabel.every((seg, i) => seg === target[i])
  ) {
    return node;
  }
  for (const child of node.children) {
    const found = findNodeByLabel(child, target);
    if (found !== undefined) return found;
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('BudgetForest.buildUnifiedTree()', () => {

  // ── Z: Zero ────────────────────────────────────────────────────────────────

  it('Z – returns null for an empty forest', () => {
    expect(BudgetForest.createEmpty(CONFIG).buildUnifiedTree()).toBeNull();
  });

  // ── S / O: Simple / One — SINGLE-SEGMENT accounts ─────────────────────────
  // For single-segment accounts intermediate logic never applies;
  // the result is the same as before: Expenses:PERIOD_SUFFIX.

  it('S – single-segment account yearly → Expenses:yearly', () => {
    /*
     *   Expenses (root ghost)
     *   └── yearly ◄── $12 000
     */
    const budget = makeBudget(12_000);
    const forest = BudgetForest.createEmpty(CONFIG)
      .insertBudget('yearly', makeAccountLabel('Expenses'), budget);

    const unified = forest.buildUnifiedTree()!;
    const node = findNode(unified, 'Expenses:yearly');
    expect(node).toBeDefined();
    expect(node!.budgets[0]!.id).toBe(budget.id);
  });

  it('O – single-segment account monthly → Expenses:yearly:quarterly:monthly', () => {
    /*
     *   Expenses
     *   └── yearly (ghost)
     *       └── quarterly (ghost)
     *           └── monthly ◄── $800
     */
    const budget = makeBudget(800);
    const forest = BudgetForest.createEmpty(CONFIG)
      .insertBudget('monthly', makeAccountLabel('Expenses'), budget);

    const unified = forest.buildUnifiedTree()!;
    expect(findNode(unified, 'Expenses:yearly')).toBeDefined();
    expect(findNode(unified, 'Expenses:yearly:quarterly')).toBeDefined();
    const node = findNode(unified, 'Expenses:yearly:quarterly:monthly');
    expect(node).toBeDefined();
    expect(node!.budgets[0]!.id).toBe(budget.id);
  });

  // ── O: One — MULTI-SEGMENT accounts ───────────────────────────────────────
  //
  // Expenses:Food (2 segments):
  //   intermediate = Expenses → gets full chain :yearly:quarterly:monthly
  //   leaf         = Food     → gets PERIOD_SUFFIX

  it('O – two-segment account yearly → Expenses:yearly:quarterly:monthly:Food:yearly', () => {
    /*
     *   Expenses
     *   └── yearly (ghost)
     *       └── quarterly (ghost)
     *           └── monthly (ghost)
     *               └── Food
     *                   └── yearly ◄── $12 000
     */
    const budget = makeBudget(12_000);
    const forest = BudgetForest.createEmpty(CONFIG)
      .insertBudget('yearly', makeAccountLabel('Expenses:Food'), budget);

    const unified = forest.buildUnifiedTree()!;

    // The full intermediate chain for Expenses must exist as ghosts
    expect(findNode(unified, 'Expenses:yearly')).toBeDefined();
    expect(findNode(unified, 'Expenses:yearly:quarterly')).toBeDefined();
    expect(findNode(unified, 'Expenses:yearly:quarterly:monthly')).toBeDefined();

    // Budget lives at the leaf Food:yearly
    const node = findNode(unified, 'Expenses:yearly:quarterly:monthly:Food:yearly');
    expect(node).toBeDefined();
    expect(node!.budgets[0]!.id).toBe(budget.id);
  });

  it('O – two-segment account quarterly → Expenses:yearly:quarterly:monthly:Food:yearly:quarterly', () => {
    const budget = makeBudget(3_000);
    const forest = BudgetForest.createEmpty(CONFIG)
      .insertBudget('quarterly', makeAccountLabel('Expenses:Food'), budget);

    const unified = forest.buildUnifiedTree()!;

    const node = findNode(unified, 'Expenses:yearly:quarterly:monthly:Food:yearly:quarterly');
    expect(node).toBeDefined();
    expect(node!.budgets[0]!.id).toBe(budget.id);
  });

  it('O – two-segment account monthly → Expenses:yearly:quarterly:monthly:Food:yearly:quarterly:monthly', () => {
    /*
     *   Expenses
     *   └── yearly (ghost)
     *       └── quarterly (ghost)
     *           └── monthly (ghost)
     *               └── Food
     *                   └── yearly (ghost)
     *                       └── quarterly (ghost)
     *                           └── monthly ◄── $800
     */
    const budget = makeBudget(800);
    const forest = BudgetForest.createEmpty(CONFIG)
      .insertBudget('monthly', makeAccountLabel('Expenses:Food'), budget);

    const unified = forest.buildUnifiedTree()!;

    const node = findNode(unified, 'Expenses:yearly:quarterly:monthly:Food:yearly:quarterly:monthly');
    expect(node).toBeDefined();
    expect(node!.budgets[0]!.id).toBe(budget.id);
  });

  // ── CRITICAL PROPERTY: child account nests inside parent period node ───────

  it('CRITICAL – Expenses:Food:monthly is a DESCENDANT of Expenses:monthly node (constraint checker can reach it)', () => {
    /*
     * For the constraint checker to work, the child budget node must be
     * reachable from the parent budget node via .children.
     *
     *   Expenses:yearly:quarterly:monthly  ($500)  ← parent budget node
     *   └── Food (ghost)
     *       └── yearly:quarterly:monthly   ($300)  ← child budget node
     *
     * collectClosestBudgets([Food ghost]) must find $300/monthly.
     */
    const parentBudget = makeBudget(500);
    const childBudget  = makeBudget(300);
    const forest = BudgetForest.createEmpty(CONFIG)
      .insertBudget('monthly', makeAccountLabel('Expenses'),      parentBudget)
      .insertBudget('monthly', makeAccountLabel('Expenses:Food'), childBudget);

    const unified = forest.buildUnifiedTree()!;

    const parentNode = findNode(unified, 'Expenses:yearly:quarterly:monthly');
    expect(parentNode).toBeDefined();
    expect(parentNode!.budgets[0]!.id).toBe(parentBudget.id);

    // The child must be findable inside the parent node's subtree
    const childNode = findNode(unified, 'Expenses:yearly:quarterly:monthly:Food:yearly:quarterly:monthly');
    expect(childNode).toBeDefined();
    expect(childNode!.budgets[0]!.id).toBe(childBudget.id);

    // Verify the child is truly a descendant (reachable via parent.children)
    function isDescendant(root: TreeNode, target: TreeNode): boolean {
      for (const child of root.children) {
        if (child === target || isDescendant(child, target)) return true;
      }
      return false;
    }
    expect(isDescendant(parentNode!, childNode!)).toBe(true);
  });

  // ── M: Many — same account with multiple periods ───────────────────────────

  it('M – same account yearly AND monthly: yearly is ancestor of monthly', () => {
    /*
     *   Expenses:yearly:quarterly:monthly:Food:yearly          ◄── $12 000
     *   └── quarterly (ghost)
     *       └── monthly ◄── $800
     *
     * Structural invariant: yearly budget node is an ancestor of monthly.
     */
    const yearlyBudget  = makeBudget(12_000);
    const monthlyBudget = makeBudget(800);
    const forest = BudgetForest.createEmpty(CONFIG)
      .insertBudget('yearly',  makeAccountLabel('Expenses:Food'), yearlyBudget)
      .insertBudget('monthly', makeAccountLabel('Expenses:Food'), monthlyBudget);

    const unified = forest.buildUnifiedTree()!;

    const yearlyNode  = findNode(unified, 'Expenses:yearly:quarterly:monthly:Food:yearly');
    const monthlyNode = findNode(unified, 'Expenses:yearly:quarterly:monthly:Food:yearly:quarterly:monthly');

    expect(yearlyNode!.budgets[0]!.id).toBe(yearlyBudget.id);
    expect(monthlyNode!.budgets[0]!.id).toBe(monthlyBudget.id);

    // yearly node must be an ancestor of monthly node
    function isDescendant(root: TreeNode, target: TreeNode): boolean {
      for (const c of root.children) {
        if (c === target || isDescendant(c, target)) return true;
      }
      return false;
    }
    expect(isDescendant(yearlyNode!, monthlyNode!)).toBe(true);
  });

  it('M – parent account (yearly) + child account (monthly): child inside parent node', () => {
    /*
     *   Expenses:yearly:quarterly:monthly:Food:yearly        ◄── $12 000
     *       └── quarterly (ghost)
     *           └── monthly (ghost)
     *               └── Groceries
     *                   └── yearly:quarterly:monthly         ◄── $500
     */
    const parentBudget = makeBudget(12_000);
    const childBudget  = makeBudget(500);
    const forest = BudgetForest.createEmpty(CONFIG)
      .insertBudget('yearly',  makeAccountLabel('Expenses:Food'),          parentBudget)
      .insertBudget('monthly', makeAccountLabel('Expenses:Food:Groceries'), childBudget);

    const unified = forest.buildUnifiedTree()!;

    const parentNode = findNode(unified, 'Expenses:yearly:quarterly:monthly:Food:yearly');
    expect(parentNode!.budgets[0]!.id).toBe(parentBudget.id);

    const childNode = findNode(
      unified,
      'Expenses:yearly:quarterly:monthly:Food:yearly:quarterly:monthly:Groceries:yearly:quarterly:monthly',
    );
    expect(childNode).toBeDefined();
    expect(childNode!.budgets[0]!.id).toBe(childBudget.id);
  });

  it('M – ghost quarterly between yearly and monthly for the same account', () => {
    /*
     * yearly AND monthly at Expenses:Food — no quarterly budget.
     * Food:yearly:quarterly must exist as a ghost with 0 budgets.
     */
    const forest = BudgetForest.createEmpty(CONFIG)
      .insertBudget('yearly',  makeAccountLabel('Expenses:Food'), makeBudget(12_000))
      .insertBudget('monthly', makeAccountLabel('Expenses:Food'), makeBudget(800));

    const unified = forest.buildUnifiedTree()!;

    const quarterlyGhost = findNode(unified, 'Expenses:yearly:quarterly:monthly:Food:yearly:quarterly');
    expect(quarterlyGhost).toBeDefined();
    expect(quarterlyGhost!.budgets).toHaveLength(0);
  });

  // ── B: Boundary ────────────────────────────────────────────────────────────

  it('B – single-segment top-level account (no interleaving needed)', () => {
    /*
     *   Expenses
     *   └── yearly:quarterly:monthly ◄── $5 000
     */
    const budget = makeBudget(5_000);
    const forest = BudgetForest.createEmpty(CONFIG)
      .insertBudget('monthly', makeAccountLabel('Expenses'), budget);

    const unified = forest.buildUnifiedTree()!;
    const node = findNode(unified, 'Expenses:yearly:quarterly:monthly');
    expect(node!.budgets[0]!.id).toBe(budget.id);
  });

  it('B – sibling accounts each get isolated period chains (no cross-contamination)', () => {
    /*
     *   Expenses:yearly:quarterly:monthly:Food:yearly:quarterly:monthly:Groceries:...monthly  ◄── $400
     *   Expenses:yearly:quarterly:monthly:Food:yearly:quarterly:monthly:DiningOut:...monthly  ◄── $300
     */
    const grocBudget   = makeBudget(400);
    const diningBudget = makeBudget(300);
    const forest = BudgetForest.createEmpty(CONFIG)
      .insertBudget('monthly', makeAccountLabel('Expenses:Food:Groceries'),  grocBudget)
      .insertBudget('monthly', makeAccountLabel('Expenses:Food:DiningOut'), diningBudget);

    const unified = forest.buildUnifiedTree()!;

    const grocNode = findNode(
      unified,
      'Expenses:yearly:quarterly:monthly:Food:yearly:quarterly:monthly:Groceries:yearly:quarterly:monthly',
    );
    expect(grocNode!.budgets[0]!.id).toBe(grocBudget.id);

    const diningNode = findNode(
      unified,
      'Expenses:yearly:quarterly:monthly:Food:yearly:quarterly:monthly:DiningOut:yearly:quarterly:monthly',
    );
    expect(diningNode!.budgets[0]!.id).toBe(diningBudget.id);
  });

  // ── I: Interface ───────────────────────────────────────────────────────────

  it('I – returns an instance of BudgetTree', () => {
    const forest = BudgetForest.createEmpty(CONFIG)
      .insertBudget('yearly', makeAccountLabel('Expenses:Food'), makeBudget(1_000));
    expect(forest.buildUnifiedTree()).toBeInstanceOf(BudgetTree);
  });

  // ── E: Exceptions / Edge cases ─────────────────────────────────────────────

  it('E – only yearly inserted: no quarterly or monthly budget nodes below', () => {
    /*
     * Expenses:Food (yearly) → Expenses:yearly:quarterly:monthly:Food:yearly
     * No Food:quarterly or Food:monthly should exist.
     */
    const forest = BudgetForest.createEmpty(CONFIG)
      .insertBudget('yearly', makeAccountLabel('Expenses:Food'), makeBudget(12_000));

    const unified = forest.buildUnifiedTree()!;

    // The yearly budget node exists
    expect(findNode(unified, 'Expenses:yearly:quarterly:monthly:Food:yearly')).toBeDefined();
    // No quarterly or monthly budget nodes deeper in the Food subtree
    expect(findNode(unified, 'Expenses:yearly:quarterly:monthly:Food:yearly:quarterly')).toBeUndefined();
    expect(findNode(unified, 'Expenses:yearly:quarterly:monthly:Food:yearly:quarterly:monthly')).toBeUndefined();
  });

  it('E – different accounts on different periods do NOT share period nodes', () => {
    /*
     *   Expenses:Food (yearly $12 000) → lives at Food:yearly
     *   Expenses:Transport (monthly $200) → lives at Transport:yearly:quarterly:monthly
     *
     * Food must NOT have a quarterly or monthly node.
     * Transport must have the full chain.
     */
    const forest = BudgetForest.createEmpty(CONFIG)
      .insertBudget('yearly',  makeAccountLabel('Expenses:Food'),      makeBudget(12_000))
      .insertBudget('monthly', makeAccountLabel('Expenses:Transport'),  makeBudget(200));

    const unified = forest.buildUnifiedTree()!;

    // Food: budget at yearly, nothing below
    expect(findNode(unified, 'Expenses:yearly:quarterly:monthly:Food:yearly')).toBeDefined();
    expect(findNode(unified, 'Expenses:yearly:quarterly:monthly:Food:yearly:quarterly')).toBeUndefined();

    // Transport: budget at monthly (full chain)
    expect(
      findNode(unified, 'Expenses:yearly:quarterly:monthly:Transport:yearly:quarterly:monthly'),
    ).toBeDefined();
  });
});
