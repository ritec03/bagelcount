import { describe, it, expect } from 'vitest';
import { BudgetInstance, BudgetTreeNode, insertBudget, makeAccountLabel } from '@/lib/budgets/budgetNode';
import { DateRange } from '@/lib/budgets/dateRange';
import { NaiveDate } from '@/lib/budgets/dateUtil';

// ── helpers ───────────────────────────────────────────────────────────────────

function d(s: string): NaiveDate {
  return NaiveDate.fromString(s);
}

function range(start: string, end: string | null): DateRange {
  return new DateRange(d(start), end === null ? null : d(end));
}

function instance(start: string, end: string | null, amount: number): BudgetInstance {
  return new BudgetInstance(range(start, end), amount);
}

function label(raw: string) {
  return makeAccountLabel(raw);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('BudgetInstance', () => {
  // (S) Simple
  it('stores effective date range and amount', () => {
    const inst = instance('2026-01-01', '2026-01-31', 500);
    expect(inst.effectiveRange.start.toString()).toBe('2026-01-01');
    expect(inst.effectiveRange.end?.toString()).toBe('2026-01-31');
    expect(inst.amount).toBe(500);
  });

  // (E) Exceptions – negative amount
  it('throws when amount is negative', () => {
    expect(() => instance('2026-01-01', '2026-01-31', -1)).toThrow(RangeError);
  });

  // (B) Boundary – zero amount is allowed
  it('allows a zero amount', () => {
    const inst = instance('2026-01-01', '2026-01-31', 0);
    expect(inst.amount).toBe(0);
  });

  // Open-ended instance
  it('accepts an open-ended effective range', () => {
    const inst = instance('2026-01-01', null, 1000);
    expect(inst.effectiveRange.end).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('makeAccountLabel', () => {
  it('creates a label from a single segment', () => {
    const lbl = makeAccountLabel('Expenses');
    expect(lbl).toEqual(['Expenses']);
  });

  it('creates a label from multiple colon-separated segments', () => {
    const lbl = makeAccountLabel('Expenses:Food:Restaurants');
    expect(lbl).toEqual(['Expenses', 'Food', 'Restaurants']);
  });

  it('throws on an empty string', () => {
    expect(() => makeAccountLabel('')).toThrow();
  });

  it('throws when any segment is empty (e.g. trailing colon)', () => {
    expect(() => makeAccountLabel('Expenses:')).toThrow();
  });

  it('throws when a middle segment is empty (e.g. double colon)', () => {
    expect(() => makeAccountLabel('Expenses::Food')).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('BudgetTreeNode', () => {
  // (I) Interface – construction
  describe('construction', () => {
    it('stores account label, budgets, and children', () => {
      const node = new BudgetTreeNode(label('Expenses:Food'), [], []);
      expect(node.accountLabel).toEqual(['Expenses', 'Food']);
      expect(node.budgets).toHaveLength(0);
      expect(node.children).toHaveLength(0);
    });

    it('stores provided budgets and children', () => {
      const inst = instance('2026-01-01', '2026-12-31', 600);
      const child = new BudgetTreeNode(label('Expenses:Food:Groceries'), [], []);
      const node = new BudgetTreeNode(label('Expenses:Food'), [inst], [child]);
      expect(node.budgets).toHaveLength(1);
      expect(node.children).toHaveLength(1);
    });
  });

  // ── filter ──────────────────────────────────────────────────────────────────

  describe('filter(range)', () => {
    // (Z) Zero – no budgets, no children → returns an empty node (structure preserved)
    it('returns a node with empty budgets when there are no budgets', () => {
      const node = new BudgetTreeNode(label('Expenses'), [], []);
      const result = node.filter(range('2026-01-01', '2026-12-31'));
      expect(result.budgets).toHaveLength(0);
      expect(result.children).toHaveLength(0);
    });

    // (S) Simple – single matching instance
    it('keeps a budget instance that overlaps the filter range', () => {
      const inst = instance('2026-01-01', '2026-06-30', 500);
      const node = new BudgetTreeNode(label('Expenses:Food'), [inst], []);
      const result = node.filter(range('2026-03-01', '2026-12-31'));
      expect(result.budgets).toHaveLength(1);
    });

    // (O) One – single non-matching instance → returns empty node
    it('returns an empty node when the only budget does not overlap', () => {
      const inst = instance('2026-01-01', '2026-03-31', 500);
      const node = new BudgetTreeNode(label('Expenses:Food'), [inst], []);
      const result = node.filter(range('2026-07-01', '2026-12-31'));
      expect(result.budgets).toHaveLength(0);
      expect(result.children).toHaveLength(0);
    });

    // (M) Many – mixed overlapping and non-overlapping instances
    it('keeps only overlapping instances from a mixed list', () => {
      const jan = instance('2026-01-01', '2026-01-31', 100);
      const feb = instance('2026-02-01', '2026-02-28', 200);
      const mar = instance('2026-03-01', '2026-03-31', 300);
      const node = new BudgetTreeNode(label('Expenses:Food'), [jan, feb, mar], []);
      // Filter covers only Feb–Mar
      const result = node.filter(range('2026-02-01', '2026-03-31'));
      expect(result.budgets).toHaveLength(2);
      expect(result.budgets[0]!.amount).toBe(200);
      expect(result.budgets[1]!.amount).toBe(300);
    });

    // (B) Boundary – instance that touches the filter range exactly on one day
    it('keeps an instance whose range touches the filter range on a single day', () => {
      const inst = instance('2026-01-01', '2026-01-15', 400);
      const node = new BudgetTreeNode(label('Expenses'), [inst], []);
      const result = node.filter(range('2026-01-15', '2026-06-30'));
      expect(result.budgets).toHaveLength(1);
    });

    // Tree recursion – children are filtered too
    it('recursively filters children and omits children with no overlap', () => {
      const parentInst = instance('2026-01-01', '2026-12-31', 1000);
      const childInst  = instance('2026-01-01', '2026-06-30', 500);
      const child = new BudgetTreeNode(label('Expenses:Food:Groceries'), [childInst], []);
      const node  = new BudgetTreeNode(label('Expenses:Food'), [parentInst], [child]);

      const result = node.filter(range('2026-07-01', '2026-12-31'));
      expect(result.budgets).toHaveLength(1);   // parent instance overlaps
      expect(result.children).toHaveLength(0);  // child has no overlap → pruned
    });

    it('includes a child node that has at least one overlapping instance', () => {
      const parentInst = instance('2026-01-01', '2026-12-31', 1000);
      const childInst  = instance('2026-06-01', '2026-12-31', 300);
      const child = new BudgetTreeNode(label('Expenses:Food:Dining'), [childInst], []);
      const node  = new BudgetTreeNode(label('Expenses:Food'), [parentInst], [child]);

      const result = node.filter(range('2026-07-01', '2026-12-31'));
      expect(result.children).toHaveLength(1);
      expect(result.children[0]!.budgets).toHaveLength(1);
    });

    it('preserves the account label on the filtered node', () => {
      const node = new BudgetTreeNode(label('Expenses:Utilities'), [], []);
      const result = node.filter(range('2026-01-01', '2026-12-31'));
      expect(result.accountLabel).toEqual(['Expenses', 'Utilities']);
    });

    // Deep nesting – grandchild pruned when it has no matching instances
    it('prunes a grandchild whose instances do not overlap', () => {
      const grandchildInst = instance('2026-01-01', '2026-03-31', 50);
      const grandchild = new BudgetTreeNode(label('Expenses:Food:Dining:Lunch'), [grandchildInst], []);
      const childInst  = instance('2026-01-01', '2026-12-31', 200);
      const child = new BudgetTreeNode(label('Expenses:Food:Dining'), [childInst], [grandchild]);
      const parentInst = instance('2026-01-01', '2026-12-31', 1000);
      const node = new BudgetTreeNode(label('Expenses:Food'), [parentInst], [child]);

      const result = node.filter(range('2026-07-01', '2026-12-31'));
      expect(result.children).toHaveLength(1);
      expect(result.children[0]!.children).toHaveLength(0); // grandchild pruned
    });

    // Intermediate node with no own matching budgets but a matching grandchild
    it('preserves an intermediate node with no matching budgets when a grandchild matches', () => {
      const grandchildInst = instance('2026-07-01', '2026-12-31', 50);
      const grandchild = new BudgetTreeNode(label('Expenses:Food:Dining:Lunch'), [grandchildInst], []);
      const child = new BudgetTreeNode(label('Expenses:Food:Dining'), [], [grandchild]);
      const parentInst = instance('2026-01-01', '2026-12-31', 1000);
      const node = new BudgetTreeNode(label('Expenses:Food'), [parentInst], [child]);

      const result = node.filter(range('2026-07-01', '2026-12-31'));
      expect(result.children).toHaveLength(1);
      expect(result.children[0]!.budgets).toHaveLength(0);
      expect(result.children[0]!.children).toHaveLength(1);
      expect(result.children[0]!.children[0]!.budgets).toHaveLength(1);
    });

    // Pruning: intermediate node with no own budgets AND no matching grandchildren → pruned
    it('prunes an intermediate node when neither it nor any descendant has a matching budget', () => {
      const grandchildInst = instance('2026-01-01', '2026-03-31', 50);
      const grandchild = new BudgetTreeNode(label('Expenses:Food:Dining:Lunch'), [grandchildInst], []);
      const child = new BudgetTreeNode(label('Expenses:Food:Dining'), [], [grandchild]);
      const parentInst = instance('2026-01-01', '2026-12-31', 1000);
      const node = new BudgetTreeNode(label('Expenses:Food'), [parentInst], [child]);

      const result = node.filter(range('2026-07-01', '2026-12-31'));
      expect(result.children).toHaveLength(0); // child pruned entirely
    });
  });

  // ── non-overlapping budget validation ────────────────────────────────────────

  describe('non-overlapping budget validation', () => {
    // (S) Simple – two clearly overlapping instances
    it('throws when two budget instances have overlapping date ranges', () => {
      const a = instance('2026-01-01', '2026-06-30', 500);
      const b = instance('2026-04-01', '2026-12-31', 600);
      expect(() => new BudgetTreeNode(label('Expenses:Food'), [a, b], [])).toThrow(RangeError);
    });

    // (O) One – single instance is always valid
    it('accepts a single budget instance', () => {
      const a = instance('2026-01-01', '2026-12-31', 500);
      expect(() => new BudgetTreeNode(label('Expenses:Food'), [a], [])).not.toThrow();
    });

    // (Z) Zero – empty list is valid
    it('accepts an empty budgets list', () => {
      expect(() => new BudgetTreeNode(label('Expenses:Food'), [], [])).not.toThrow();
    });

    // (M) Many – multiple non-overlapping instances are valid
    it('accepts multiple non-overlapping instances', () => {
      const jan = instance('2026-01-01', '2026-01-31', 100);
      const feb = instance('2026-02-01', '2026-02-28', 200);
      const mar = instance('2026-03-01', '2026-03-31', 300);
      expect(() => new BudgetTreeNode(label('Expenses:Food'), [jan, feb, mar], [])).not.toThrow();
    });

    // (B) Boundary – adjacent (touching) instances are NOT overlapping
    it('accepts instances whose ranges are adjacent (share no day)', () => {
      const first  = instance('2026-01-01', '2026-01-31', 100);
      const second = instance('2026-02-01', '2026-06-30', 200);
      expect(() => new BudgetTreeNode(label('Expenses:Food'), [first, second], [])).not.toThrow();
    });

    // (B) Boundary – instances sharing exactly one day DO overlap
    it('throws when two instances share exactly one day', () => {
      const a = instance('2026-01-01', '2026-01-15', 100);
      const b = instance('2026-01-15', '2026-01-31', 200);
      expect(() => new BudgetTreeNode(label('Expenses:Food'), [a, b], [])).toThrow(RangeError);
    });

    // Open-ended instance overlapping a later instance
    it('throws when an open-ended instance overlaps a later instance', () => {
      const a = instance('2026-01-01', null, 500);
      const b = instance('2026-06-01', '2026-12-31', 300);
      expect(() => new BudgetTreeNode(label('Expenses:Food'), [a, b], [])).toThrow(RangeError);
    });

    // Two open-ended instances always overlap
    it('throws for two open-ended instances', () => {
      const a = instance('2026-01-01', null, 500);
      const b = instance('2026-06-01', null, 300);
      expect(() => new BudgetTreeNode(label('Expenses:Food'), [a, b], [])).toThrow(RangeError);
    });
  });

  // ── sorted canonical insert ───────────────────────────────────────────────

  describe('sorted canonical budgets array', () => {
    it('budgets are stored sorted by start date regardless of insertion order', () => {
      // Pass instances out-of-order; the constructor should sort them.
      const mar = instance('2026-03-01', '2026-03-31', 300);
      const jan = instance('2026-01-01', '2026-01-31', 100);
      const feb = instance('2026-02-01', '2026-02-28', 200);
      const node = new BudgetTreeNode(label('Expenses:Food'), [mar, jan, feb], []);
      expect(node.budgets[0]!.amount).toBe(100); // jan first
      expect(node.budgets[1]!.amount).toBe(200); // feb second
      expect(node.budgets[2]!.amount).toBe(300); // mar third
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('insertBudget', () => {
  // (S) Simple – insert into the root node itself
  it('inserts a budget instance into the root node when the label matches', () => {
    const root = new BudgetTreeNode(label('Expenses'), [], []);
    const inst = instance('2026-01-01', '2026-12-31', 500);
    const result = insertBudget(root, label('Expenses'), inst);
    expect(result.budgets).toHaveLength(1);
    expect(result.budgets[0]!.amount).toBe(500);
  });

  // (O) One – insert into an existing direct child
  it('inserts into an existing child node', () => {
    const child = new BudgetTreeNode(label('Expenses:Food'), [], []);
    const root  = new BudgetTreeNode(label('Expenses'), [], [child]);
    const inst  = instance('2026-01-01', '2026-12-31', 300);
    const result = insertBudget(root, label('Expenses:Food'), inst);
    expect(result.children).toHaveLength(1);
    expect(result.children[0]!.budgets).toHaveLength(1);
  });

  // (M) Many – insert into a deeply nested existing node
  it('inserts into a deeply nested existing node', () => {
    const grandchild = new BudgetTreeNode(label('Expenses:Food:Restaurants'), [], []);
    const child = new BudgetTreeNode(label('Expenses:Food'), [], [grandchild]);
    const root  = new BudgetTreeNode(label('Expenses'), [], [child]);
    const inst  = instance('2026-01-01', '2026-12-31', 200);
    const result = insertBudget(root, label('Expenses:Food:Restaurants'), inst);
    expect(result.children[0]!.children[0]!.budgets).toHaveLength(1);
  });

  // Missing intermediate node – creates it
  it('creates a missing intermediate node when inserting a deep label', () => {
    const root = new BudgetTreeNode(label('Expenses'), [], []);
    const inst = instance('2026-01-01', '2026-12-31', 150);
    const result = insertBudget(root, label('Expenses:Food:Restaurants'), inst);

    expect(result.children).toHaveLength(1);
    const food = result.children[0]!;
    expect(food.accountLabel).toEqual(['Expenses', 'Food']);
    expect(food.budgets).toHaveLength(0);
    expect(food.children).toHaveLength(1);
    const restaurants = food.children[0]!;
    expect(restaurants.accountLabel).toEqual(['Expenses', 'Food', 'Restaurants']);
    expect(restaurants.budgets).toHaveLength(1);
  });

  // Multiple missing intermediate nodes
  it('creates multiple missing intermediate nodes', () => {
    const root = new BudgetTreeNode(label('Expenses'), [], []);
    const inst = instance('2026-01-01', '2026-12-31', 75);
    const result = insertBudget(root, label('Expenses:Food:Restaurants:Sushi'), inst);

    const food        = result.children[0]!;
    const restaurants = food.children[0]!;
    const sushi       = restaurants.children[0]!;
    expect(food.accountLabel).toEqual(['Expenses', 'Food']);
    expect(restaurants.accountLabel).toEqual(['Expenses', 'Food', 'Restaurants']);
    expect(sushi.accountLabel).toEqual(['Expenses', 'Food', 'Restaurants', 'Sushi']);
    expect(sushi.budgets).toHaveLength(1);
  });

  // (E) Exceptions – label does not start with root's account label
  it('throws when the account label does not start with the root label', () => {
    const root = new BudgetTreeNode(label('Expenses'), [], []);
    const inst = instance('2026-01-01', '2026-12-31', 100);
    expect(() => insertBudget(root, label('Income:Salary'), inst)).toThrow();
  });

  // Immutability – original tree is not mutated
  it('does not mutate the original tree', () => {
    const root = new BudgetTreeNode(label('Expenses'), [], []);
    const inst = instance('2026-01-01', '2026-12-31', 500);
    insertBudget(root, label('Expenses'), inst);
    expect(root.budgets).toHaveLength(0);
  });

  // Non-overlapping constraint is respected on insert
  it('throws when inserting a budget instance that overlaps an existing one', () => {
    const existing = instance('2026-01-01', '2026-06-30', 500);
    const root = new BudgetTreeNode(label('Expenses'), [existing], []);
    const overlapping = instance('2026-04-01', '2026-12-31', 300);
    expect(() => insertBudget(root, label('Expenses'), overlapping)).toThrow(RangeError);
  });

  // Sorted insert: result budgets are sorted by start date
  it('inserts into the correct sorted position', () => {
    const jan = instance('2026-01-01', '2026-01-31', 100);
    const mar = instance('2026-03-01', '2026-03-31', 300);
    const root = new BudgetTreeNode(label('Expenses'), [jan, mar], []);
    const feb  = instance('2026-02-01', '2026-02-28', 200);
    const result = insertBudget(root, label('Expenses'), feb);
    expect(result.budgets[0]!.amount).toBe(100);
    expect(result.budgets[1]!.amount).toBe(200);
    expect(result.budgets[2]!.amount).toBe(300);
  });
});
