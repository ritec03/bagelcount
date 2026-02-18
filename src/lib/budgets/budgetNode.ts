import { DateRange, overlap } from '@/lib/budgets/dateRange';

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

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Assert that no two instances in `budgets` have overlapping date ranges.
 * Runs in O(n²) — acceptable for the small lists expected in practice.
 *
 * @throws {RangeError} on the first detected overlap.
 */
function assertNonOverlapping(budgets: readonly BudgetInstance[]): void {
  for (let i = 0; i < budgets.length; i++) {
    for (let j = i + 1; j < budgets.length; j++) {
      if (overlap(budgets[i]!.effectiveRange, budgets[j]!.effectiveRange) !== null) {
        throw new RangeError(
          `Budget instances at indices ${i} and ${j} have overlapping date ranges.`,
        );
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * A node in a budget tree, corresponding to a single Beancount account segment.
 *
 * - `accountLabel` — the full account name for this node (e.g. `"Expenses:Food"`).
 * - `budgets` — ordered list of {@link BudgetInstance} values covering
 *   **non-overlapping** date ranges for this account. The constructor enforces
 *   this invariant and throws {@link RangeError} if it is violated.
 * - `children` — sub-account nodes.
 *
 * The tree does **not** carry frequency / period information; that belongs to
 * the containing budget tree.
 */
export class BudgetTreeNode {
  readonly accountLabel: string;
  readonly budgets: readonly BudgetInstance[];
  readonly children: readonly BudgetTreeNode[];

  constructor(
    accountLabel: string,
    budgets: readonly BudgetInstance[],
    children: readonly BudgetTreeNode[],
  ) {
    assertNonOverlapping(budgets);
    this.accountLabel = accountLabel;
    this.budgets = budgets;
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
// Account label helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Split a colon-separated Beancount account label into its individual segments.
 *
 * @example
 * parseAccountLabel('Expenses:Food:Restaurants')
 * // → ['Expenses', 'Food', 'Restaurants']
 *
 * @throws {Error} if `label` is an empty string.
 */
export function parseAccountLabel(label: string): string[] {
  if (label.length === 0) {
    throw new Error('Account label must not be empty.');
  }
  return label.split(':');
}

// ─────────────────────────────────────────────────────────────────────────────
// insertBudget
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return a new tree with `inst` inserted into the node whose `accountLabel`
 * matches `targetLabel`, creating any missing intermediate nodes along the way.
 *
 * The `targetLabel` must be a descendant path of `root.accountLabel`
 * (e.g. root is `"Expenses"` and target is `"Expenses:Food:Restaurants"`).
 *
 * The non-overlapping invariant of {@link BudgetTreeNode} is enforced: if
 * `inst` overlaps an existing budget at the target node a {@link RangeError}
 * is thrown.
 *
 * The original tree is never mutated.
 *
 * @throws {Error} if `targetLabel` does not start with `root.accountLabel`.
 */
export function insertBudget(
  root: BudgetTreeNode,
  targetLabel: string,
  inst: BudgetInstance,
): BudgetTreeNode {
  const rootSegments   = parseAccountLabel(root.accountLabel);
  const targetSegments = parseAccountLabel(targetLabel);

  // Validate that targetLabel is a descendant (or equal) of root.accountLabel.
  if (targetSegments.length < rootSegments.length) {
    throw new Error(
      `Target label "${targetLabel}" is not a descendant of root "${root.accountLabel}".`,
    );
  }
  for (let i = 0; i < rootSegments.length; i++) {
    if (rootSegments[i] !== targetSegments[i]) {
      throw new Error(
        `Target label "${targetLabel}" is not a descendant of root "${root.accountLabel}".`,
      );
    }
  }

  return insertAt(root, targetSegments, rootSegments.length, inst);
}

/**
 * Recursive helper: walk down the tree one segment at a time.
 *
 * @param node         - Current node being visited.
 * @param targetSegs   - Full segment array of the target label.
 * @param depth        - Index of the *next* segment to match (i.e. how many
 *                       segments of `targetSegs` this node already represents).
 * @param inst         - The instance to insert.
 */
function insertAt(
  node: BudgetTreeNode,
  targetSegs: string[],
  depth: number,
  inst: BudgetInstance,
): BudgetTreeNode {
  // Base case: this node IS the target.
  if (depth === targetSegs.length) {
    return new BudgetTreeNode(node.accountLabel, [...node.budgets, inst], node.children);
  }

  // The next child label is the target segments joined up to depth+1.
  const nextLabel = targetSegs.slice(0, depth + 1).join(':');

  // Find an existing child that matches the next label.
  const existingIdx = node.children.findIndex((c) => c.accountLabel === nextLabel);

  let updatedChildren: BudgetTreeNode[];

  if (existingIdx !== -1) {
    // Recurse into the existing child.
    const updatedChild = insertAt(node.children[existingIdx]!, targetSegs, depth + 1, inst);
    updatedChildren = [
      ...node.children.slice(0, existingIdx),
      updatedChild,
      ...node.children.slice(existingIdx + 1),
    ];
  } else {
    // No matching child — create it (and any further missing intermediates)
    // by recursing into a fresh empty node.
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