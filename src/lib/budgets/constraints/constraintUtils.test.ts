/**
 * ZOMBIES tests for the cross-frequency constraint utilities:
 *   - {@link nodeFrequency}    (budgetNode.ts)
 *   - {@link collectClosestBudgets} (budgetNode.ts)
 *   - {@link periodScaleFactor}    (periodScale.ts)
 */

import { describe, it, expect } from 'vitest';
import {
  BudgetTreeNode,
  GhostNode,
  nodeFrequency,
  collectClosestBudgets,
} from '@/lib/budgets/core/budgetNode';
import { makeAccountLabel } from '@/lib/budgets/core/accountLabel';
import { BudgetInstance } from '@/lib/budgets/core/budgetInstance';
import { DateRange } from '@/lib/utils/dateRange';
import { NaiveDate } from '@/lib/utils/dateUtil';
import { periodScaleFactor } from './periodScale';

// ─── helpers ─────────────────────────────────────────────────────────────────

function lbl(raw: string) {
  return makeAccountLabel(raw);
}

let _id = 0;
function inst(amount: number): BudgetInstance {
  const start = NaiveDate.fromString('2026-01-01');
  return new BudgetInstance(new DateRange(start, null), amount, `id-${++_id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// nodeFrequency
// ─────────────────────────────────────────────────────────────────────────────
//
// ZOMBIES:
//   Z – label with no period segment → null
//   O – label ending in a single period word
//   M – label with multiple period words (returns the last one, i.e. finest)
//   B – period word in the middle of a longer label
//   I – return type is PeriodType | null
//   E – label that is just a period word (single segment)
//   S – simplest non-null case: two-segment label ending in yearly

describe('nodeFrequency', () => {
  it('Z – returns null for a plain account label with no period segment', () => {
    const node = new BudgetTreeNode(lbl('Expenses:Food'), [], []);
    expect(nodeFrequency(node)).toBeNull();
  });

  it('S – returns yearly for Expenses:Food:yearly', () => {
    const node = new GhostNode(lbl('Expenses:Food:yearly'), []);
    expect(nodeFrequency(node)).toBe('yearly');
  });

  it('O – returns quarterly for Expenses:Food:yearly:quarterly', () => {
    const node = new GhostNode(lbl('Expenses:Food:yearly:quarterly'), []);
    expect(nodeFrequency(node)).toBe('quarterly');
  });

  it('O – returns monthly for Expenses:Food:yearly:quarterly:monthly', () => {
    const node = new GhostNode(lbl('Expenses:Food:yearly:quarterly:monthly'), []);
    expect(nodeFrequency(node)).toBe('monthly');
  });

  it('M – deeply nested child account label ending in monthly → monthly', () => {
    //  Expenses:Food:Groceries:yearly:quarterly:monthly
    const node = new BudgetTreeNode(
      lbl('Expenses:Food:Groceries:yearly:quarterly:monthly'),
      [],
      [],
    );
    expect(nodeFrequency(node)).toBe('monthly');
  });

  it('E – single-segment label that IS a period word → returns that period', () => {
    // Edge: a node whose entire label is just "monthly"
    const node = new GhostNode(lbl('monthly'), []);
    expect(nodeFrequency(node)).toBe('monthly');
  });

  it('B – period word not at the end → returns null (no trailing period)', () => {
    // "yearly" appears but is NOT the last segment
    const node = new BudgetTreeNode(lbl('Expenses:yearly:Food'), [], []);
    // Last segment is "Food" (not a period word)
    expect(nodeFrequency(node)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// collectClosestBudgets
// ─────────────────────────────────────────────────────────────────────────────
//
// ZOMBIES:
//   Z – empty nodes list → []
//   O – single real BudgetTreeNode with one budget → returns it
//   M – mix of ghost layers and real nodes; only closest per branch
//   B – BudgetTreeNode with 0 budgets treated as transparent
//   I – returned freq comes from nodeFrequency on that node
//   E – real node with budget stops descent (does NOT collect grandchildren)
//   S – one ghost layer above one real node

describe('collectClosestBudgets', () => {
  it('Z – empty array → returns empty array', () => {
    expect(collectClosestBudgets([])).toEqual([]);
  });

  it('S – single ghost above single real node returns the real budget', () => {
    /*
     *  Ghost: Expenses:Food:yearly          (no budget)
     *  └── Budget: Expenses:Food:yearly:quarterly:monthly  ($500)
     */
    const budget = inst(500);
    const realNode = new BudgetTreeNode(
      lbl('Expenses:Food:yearly:quarterly:monthly'),
      [budget],
      [],
    );
    const ghost = new GhostNode(lbl('Expenses:Food:yearly'), [realNode]);

    const result = collectClosestBudgets([ghost]);
    expect(result).toHaveLength(1);
    expect(result[0]!.inst.id).toBe(budget.id);
    expect(result[0]!.freq).toBe('monthly');
  });

  it('O – BudgetTreeNode directly in the list → collected immediately', () => {
    const budget = inst(1000);
    const node = new BudgetTreeNode(lbl('Expenses:Food:yearly'), [budget], []);

    const result = collectClosestBudgets([node]);
    expect(result).toHaveLength(1);
    expect(result[0]!.freq).toBe('yearly');
  });

  it('M – two branches: each returns its closest budget independently', () => {
    /*
     *  Ghost: Expenses:Food:yearly
     *  ├── Ghost: Expenses:Food:yearly:quarterly
     *  │   └── Real: Expenses:Food:yearly:quarterly:monthly  ($500)
     *  └── Real: Expenses:Food:Groceries:yearly              ($800)
     */
    const b500 = inst(500);
    const b800 = inst(800);

    const monthlyNode = new BudgetTreeNode(
      lbl('Expenses:Food:yearly:quarterly:monthly'),
      [b500],
      [],
    );
    const quarterlyGhost = new GhostNode(
      lbl('Expenses:Food:yearly:quarterly'),
      [monthlyNode],
    );
    const groceriesYearly = new BudgetTreeNode(
      lbl('Expenses:Food:Groceries:yearly'),
      [b800],
      [],
    );
    const yearlyGhost = new GhostNode(
      lbl('Expenses:Food:yearly'),
      [quarterlyGhost, groceriesYearly],
    );

    const result = collectClosestBudgets([yearlyGhost]);
    expect(result).toHaveLength(2);

    const freqs = result.map(r => r.freq).sort();
    expect(freqs).toEqual(['monthly', 'yearly']);
  });

  it('E – real node stops descent (grandchild budgets are NOT collected)', () => {
    /*
     * Real: Expenses:Food:yearly  ($12 000)
     * └── Real: Expenses:Food:yearly:quarterly:monthly  ($500)   ← must NOT appear
     */
    const b12000 = inst(12_000);
    const b500   = inst(500);

    const monthlyNode = new BudgetTreeNode(
      lbl('Expenses:Food:yearly:quarterly:monthly'),
      [b500],
      [],
    );
    const yearlyNode = new BudgetTreeNode(
      lbl('Expenses:Food:yearly'),
      [b12000],
      [monthlyNode],
    );

    const result = collectClosestBudgets([yearlyNode]);
    expect(result).toHaveLength(1);
    expect(result[0]!.inst.id).toBe(b12000.id);
  });

  it('B – BudgetTreeNode with 0 budgets is transparent (descends into children)', () => {
    const budget = inst(300);
    const realNode = new BudgetTreeNode(
      lbl('Expenses:Food:yearly:quarterly:monthly'),
      [budget],
      [],
    );
    // BudgetTreeNode with 0 budgets should behave like a ghost
    const emptyBudgetNode = new BudgetTreeNode(
      lbl('Expenses:Food:yearly'),
      [],
      [realNode],
    );

    const result = collectClosestBudgets([emptyBudgetNode]);
    expect(result).toHaveLength(1);
    expect(result[0]!.inst.id).toBe(budget.id);
  });

  it('I – returned freq is null-safe: nodes without period segment are skipped', () => {
    // A real BudgetTreeNode whose label has NO period segment
    const budget = inst(100);
    const plainNode = new BudgetTreeNode(lbl('Expenses:Food'), [budget], []);

    const result = collectClosestBudgets([plainNode]);
    // nodeFrequency returns null → not collected
    expect(result).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// periodScaleFactor
// ─────────────────────────────────────────────────────────────────────────────
//
// ZOMBIES:
//   Z – same frequency → factor = 1
//   O – monthly → yearly = 12
//   M – quarterly → yearly = 4; monthly → quarterly = 3
//   B – inverse: yearly → monthly = 1/12
//   I – return type is number
//   E – all 9 combinations are mathematically consistent (multiply then divide)
//   S – simplest: monthly → monthly = 1

describe('periodScaleFactor', () => {
  it('S – same frequency returns 1 (monthly → monthly)', () => {
    expect(periodScaleFactor('monthly', 'monthly')).toBe(1);
  });

  it('Z – same frequency returns 1 for all periods', () => {
    expect(periodScaleFactor('yearly',    'yearly')).toBe(1);
    expect(periodScaleFactor('quarterly', 'quarterly')).toBe(1);
  });

  it('O – monthly → yearly = 12', () => {
    expect(periodScaleFactor('monthly', 'yearly')).toBe(12);
  });

  it('M – quarterly → yearly = 4', () => {
    expect(periodScaleFactor('quarterly', 'yearly')).toBe(4);
  });

  it('M – monthly → quarterly = 3', () => {
    expect(periodScaleFactor('monthly', 'quarterly')).toBe(3);
  });

  it('B – yearly → monthly = 1/12 (inverse scaling)', () => {
    expect(periodScaleFactor('yearly', 'monthly')).toBeCloseTo(1 / 12);
  });

  it('B – yearly → quarterly = 1/4', () => {
    expect(periodScaleFactor('yearly', 'quarterly')).toBeCloseTo(1 / 4);
  });

  it('E – round-trip: factor(a→b) × factor(b→a) = 1', () => {
    const pairs: Array<['monthly' | 'quarterly' | 'yearly', 'monthly' | 'quarterly' | 'yearly']> = [
      ['monthly', 'yearly'],
      ['monthly', 'quarterly'],
      ['quarterly', 'yearly'],
    ];
    for (const [a, b] of pairs) {
      expect(periodScaleFactor(a, b) * periodScaleFactor(b, a)).toBeCloseTo(1);
    }
  });
});
