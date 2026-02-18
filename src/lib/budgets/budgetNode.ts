import { DateRange, overlap } from '@/lib/budgets/dateRange';

/**
 * A single budget entry that is valid for a specific {@link DateRange}.
 *
 * Multiple `BudgetInstance` objects in the same {@link BudgetTreeNode} must
 * cover **non-overlapping** date ranges (enforced by the caller / domain layer).
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

/**
 * A node in a budget tree, corresponding to a single Beancount account segment.
 *
 * - `accountLabel` — the full account name for this node (e.g. `"Expenses:Food"`).
 * - `budgets` — ordered list of {@link BudgetInstance} values covering
 *   non-overlapping date ranges for this account.
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