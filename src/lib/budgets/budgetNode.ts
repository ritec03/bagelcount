import { DateRange, overlap } from '@/lib/budgets/dateRange';

// ─────────────────────────────────────────────────────────────────────────────
// AccountLabel – branded segment array
// ─────────────────────────────────────────────────────────────────────────────

declare const accountLabelBrand: unique symbol;

/**
 * A non-empty, pre-segmented Beancount account label.
 *
 * Use {@link makeAccountLabel} to construct one from a raw colon-separated
 * string. The brand prevents accidental use of plain `string[]` values.
 *
 * @example
 * const lbl = makeAccountLabel('Expenses:Food:Restaurants');
 * // lbl → ['Expenses', 'Food', 'Restaurants']
 */
export type AccountLabel = readonly [string, ...string[]] & {
  readonly [accountLabelBrand]: true;
};

/**
 * Parse a colon-separated Beancount account string into an {@link AccountLabel}.
 *
 * @throws {Error} if `raw` is empty or contains an empty segment.
 */
export function makeAccountLabel(raw: string): AccountLabel {
  const segments = raw.split(':');
  if (segments.length === 0 || segments.some((s) => s.length === 0)) {
    throw new Error(
      `Invalid account label "${raw}": must be non-empty and contain no empty segments.`,
    );
  }
  return segments as unknown as AccountLabel;
}

/** Compare two AccountLabels structurally, segment by segment. */
function labelEquals(a: AccountLabel, b: AccountLabel): boolean {
  return a.length === b.length && a.every((seg, i) => seg === b[i]);
}

/** Join an {@link AccountLabel} back to its colon-separated string form. */
function labelToString(lbl: AccountLabel): string {
  return lbl.join(':');
}

// ─────────────────────────────────────────────────────────────────────────────
// BudgetInstance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single budget entry that is valid for a specific {@link DateRange}.
 *
 * Multiple `BudgetInstance` objects in the same {@link BudgetTreeNode} must
 * cover **non-overlapping** date ranges (enforced by the constructor).
 *
 * @throws {RangeError} if `amount` is negative.
 */
export class BudgetInstance {
  readonly effectiveRange: DateRange;
  readonly amount: number;

  constructor(effectiveRange: DateRange, amount: number) {
    if (amount < 0) {
      throw new RangeError(`BudgetInstance amount must be non-negative, got ${amount}.`);
    }
    this.effectiveRange = effectiveRange;
    this.amount = amount;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sorted insert helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Compare two NaiveDates by value. Returns negative, 0, or positive. */
function compareDateValue(
  a: { year: number; month: number; day: number },
  b: { year: number; month: number; day: number },
): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

/**
 * Find the index at which `inst` should be inserted to keep `sorted` ordered
 * by `effectiveRange.start` (binary search, O(log n)).
 */
function sortedInsertIndex(sorted: readonly BudgetInstance[], inst: BudgetInstance): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compareDateValue(sorted[mid]!.effectiveRange.start, inst.effectiveRange.start) <= 0) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/**
 * Insert `inst` into `sorted` at the correct position (by start date) and
 * validate that it does not overlap its immediate neighbours.
 *
 * Because the array is sorted, only the left and right neighbours need to be
 * checked — O(1) overlap checks instead of O(n).
 *
 * @throws {RangeError} if `inst` overlaps a neighbour.
 */
function sortedInsert(sorted: readonly BudgetInstance[], inst: BudgetInstance): BudgetInstance[] {
  const idx = sortedInsertIndex(sorted, inst);

  const left  = sorted[idx - 1];
  const right = sorted[idx];

  if (left !== undefined && overlap(left.effectiveRange, inst.effectiveRange) !== null) {
    throw new RangeError(
      `New budget instance overlaps the preceding instance (index ${idx - 1}).`,
    );
  }
  if (right !== undefined && overlap(inst.effectiveRange, right.effectiveRange) !== null) {
    throw new RangeError(
      `New budget instance overlaps the following instance (index ${idx}).`,
    );
  }

  return [...sorted.slice(0, idx), inst, ...sorted.slice(idx)];
}

/**
 * Sort `budgets` by start date and validate that no two are overlapping.
 * Used by the constructor to canonicalise an arbitrary input array.
 *
 * @throws {RangeError} on the first detected overlap (after sorting).
 */
function sortAndValidate(budgets: readonly BudgetInstance[]): BudgetInstance[] {
  const sorted = [...budgets].sort((a, b) =>
    compareDateValue(a.effectiveRange.start, b.effectiveRange.start),
  );
  // After sorting, only adjacent pairs can overlap.
  for (let i = 0; i < sorted.length - 1; i++) {
    if (overlap(sorted[i]!.effectiveRange, sorted[i + 1]!.effectiveRange) !== null) {
      throw new RangeError(
        `Budget instances at sorted positions ${i} and ${i + 1} have overlapping date ranges.`,
      );
    }
  }
  return sorted;
}

// ─────────────────────────────────────────────────────────────────────────────
// BudgetTreeNode
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A node in a budget tree, corresponding to a single Beancount account.
 *
 * - `accountLabel` — the full account name as a pre-segmented
 *   {@link AccountLabel} (e.g. `['Expenses', 'Food']`).
 * - `budgets` — **sorted** (by start date), **non-overlapping**
 *   {@link BudgetInstance} array. The constructor enforces both invariants.
 * - `children` — sub-account nodes.
 *
 * The tree does **not** carry frequency / period information; that belongs to
 * the containing budget tree.
 */
export class BudgetTreeNode {
  readonly accountLabel: AccountLabel;
  readonly budgets: readonly BudgetInstance[];
  readonly children: readonly BudgetTreeNode[];

  constructor(
    accountLabel: AccountLabel,
    budgets: readonly BudgetInstance[],
    children: readonly BudgetTreeNode[],
  ) {
    this.accountLabel = accountLabel;
    this.budgets = sortAndValidate(budgets);
    this.children = children;
  }

  /**
   * Return a new tree containing only the {@link BudgetInstance} entries
   * (in this node and all descendants) whose effective date range overlaps
   * with `filterRange`.
   *
   * **Pruning rule:** a child node is removed from the result only when its
   * entire subtree contains no matching instances — i.e., after filtering it
   * has both an empty `budgets` list *and* an empty `children` list.
   * An intermediate node that has no matching instances of its own is
   * **preserved** as long as at least one descendant has a matching instance.
   *
   * The original tree is never mutated. Always returns a {@link BudgetTreeNode};
   * the root result may itself have empty `budgets` and `children` if nothing
   * in the whole tree matched.
   */
  filter(filterRange: DateRange): BudgetTreeNode {
    const matchingBudgets = this.budgets.filter(
      (inst) => overlap(inst.effectiveRange, filterRange) !== null,
    );

    const matchingChildren = this.children
      .map((child) => child.filter(filterRange))
      .filter((child) => child.budgets.length > 0 || child.children.length > 0);

    return new BudgetTreeNode(this.accountLabel, matchingBudgets, matchingChildren);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// insertBudget
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return a new tree with `inst` inserted into the node whose
 * `accountLabel` matches `targetLabel`, creating any missing intermediate
 * nodes along the way.
 *
 * `targetLabel` must be a descendant-or-equal path of `root.accountLabel`.
 * The sorted, non-overlapping invariant is enforced: a {@link RangeError} is
 * thrown if `inst` overlaps an existing budget at the target node.
 *
 * The original tree is never mutated.
 *
 * @throws {Error} if `targetLabel` is not a descendant of `root.accountLabel`.
 */
export function insertBudget(
  root: BudgetTreeNode,
  targetLabel: AccountLabel,
  inst: BudgetInstance,
): BudgetTreeNode {
  const rootSegs   = root.accountLabel;
  const targetSegs = targetLabel;

  if (targetSegs.length < rootSegs.length) {
    throw new Error(
      `Target "${labelToString(targetLabel)}" is not a descendant of root "${labelToString(rootSegs)}".`,
    );
  }
  for (let i = 0; i < rootSegs.length; i++) {
    if (rootSegs[i] !== targetSegs[i]) {
      throw new Error(
        `Target "${labelToString(targetLabel)}" is not a descendant of root "${labelToString(rootSegs)}".`,
      );
    }
  }

  return insertAt(root, targetSegs, rootSegs.length, inst);
}

function insertAt(
  node: BudgetTreeNode,
  targetSegs: AccountLabel,
  depth: number,
  inst: BudgetInstance,
): BudgetTreeNode {
  // Base case: this node IS the target.
  if (depth === targetSegs.length) {
    const newBudgets = sortedInsert(node.budgets, inst);
    return new BudgetTreeNode(node.accountLabel, newBudgets, node.children);
  }

  // The next child label is the target segments joined up to depth+1.
  const nextLabel = makeAccountLabel(targetSegs.slice(0, depth + 1).join(':'));

  const existingIdx = node.children.findIndex(
    (c) => labelEquals(c.accountLabel, nextLabel),
  );

  let updatedChildren: BudgetTreeNode[];

  if (existingIdx !== -1) {
    const updatedChild = insertAt(node.children[existingIdx]!, targetSegs, depth + 1, inst);
    updatedChildren = [
      ...node.children.slice(0, existingIdx),
      updatedChild,
      ...node.children.slice(existingIdx + 1),
    ];
  } else {
    const newChild = insertAt(
      new BudgetTreeNode(nextLabel, [], []),
      targetSegs,
      depth + 1,
      inst,
    );
    updatedChildren = [...node.children, newChild];
  }

  return new BudgetTreeNode(node.accountLabel, node.budgets, updatedChildren);
}

// ─────────────────────────────────────────────────────────────────────────────
// deleteBudget
// ─────────────────────────────────────────────────────────────────────────────

import { dateRangeEquals } from '@/lib/budgets/dateRange';

/**
 * Return a new tree with the {@link BudgetInstance} whose `effectiveRange`
 * exactly matches `targetRange` removed from the node identified by
 * `targetLabel`.
 *
 * @throws {Error} if `targetLabel` is not a descendant of `root.accountLabel`,
 *   if no node with that label exists, or if no budget with that exact range
 *   exists at the target node.
 */
export function deleteBudget(
  root: BudgetTreeNode,
  targetLabel: AccountLabel,
  targetRange: DateRange,
): BudgetTreeNode {
  const rootSegs   = root.accountLabel;
  const targetSegs = targetLabel;

  if (targetSegs.length < rootSegs.length) {
    throw new Error(
      `Target "${labelToString(targetLabel)}" is not a descendant of root "${labelToString(rootSegs)}".`,
    );
  }
  for (let i = 0; i < rootSegs.length; i++) {
    if (rootSegs[i] !== targetSegs[i]) {
      throw new Error(
        `Target "${labelToString(targetLabel)}" is not a descendant of root "${labelToString(rootSegs)}".`,
      );
    }
  }

  return deleteAt(root, targetSegs, rootSegs.length, targetRange);
}

function deleteAt(
  node: BudgetTreeNode,
  targetSegs: AccountLabel,
  depth: number,
  targetRange: DateRange,
): BudgetTreeNode {
  // Base case: this node IS the target — remove the matching budget.
  if (depth === targetSegs.length) {
    const idx = node.budgets.findIndex((b) => dateRangeEquals(b.effectiveRange, targetRange));
    if (idx === -1) {
      throw new Error(
        `No budget with range ${targetRange.start.toString()}–${targetRange.end?.toString() ?? '∞'} found at "${labelToString(node.accountLabel)}".`,
      );
    }
    const newBudgets = [...node.budgets.slice(0, idx), ...node.budgets.slice(idx + 1)];
    return new BudgetTreeNode(node.accountLabel, newBudgets, node.children);
  }

  // Walk down to the next matching child.
  const nextLabel = makeAccountLabel(targetSegs.slice(0, depth + 1).join(':'));
  const existingIdx = node.children.findIndex((c) => labelEquals(c.accountLabel, nextLabel));

  if (existingIdx === -1) {
    throw new Error(
      `No node with label "${labelToString(nextLabel)}" found under "${labelToString(node.accountLabel)}".`,
    );
  }

  const updatedChild = deleteAt(node.children[existingIdx]!, targetSegs, depth + 1, targetRange);
  const updatedChildren = [
    ...node.children.slice(0, existingIdx),
    updatedChild,
    ...node.children.slice(existingIdx + 1),
  ];

  return new BudgetTreeNode(node.accountLabel, node.budgets, updatedChildren);
}


