import { DateRange, dateRangeEquals, overlap } from '@/lib/budgets/dateRange';
import { labelEquals, labelToString, makeAccountLabel, type AccountLabel } from './accountLabel';
import { sortAndValidate, sortedInsert, type BudgetInstance } from './budgetInstance';

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


