import { labelEquals, makeAccountLabel } from "./accountLabel";
import type { AccountLabel } from "./accountLabel";
import type { BudgetInstance } from "./budgetInstance";
import { BudgetTree } from "./budgetTree";
import { type ConstraintConfig, type ConstraintViolationMap } from "../constraints/constraints";
import type { OperationFailure, OperationSuccess } from "../service/budgetManagerInterface";
import type { PeriodType } from "@/lib/models/types";
import { DateRange } from "@/lib/utils/dateRange";
import type { BudgetTreeNode } from "./budgetNode";

export type BudgetForestOperationResult =
  | ({ forest: ABudgetForest } & OperationSuccess)
  | OperationFailure;

// ─────────────────────────────────────────────────────────────────────────────
// Abstract interface
// ─────────────────────────────────────────────────────────────────────────────

export abstract class ABudgetForest {
  abstract getTree(period: PeriodType): BudgetTree | undefined;
  abstract insertBudget(period: PeriodType, label: AccountLabel, inst: BudgetInstance): ABudgetForest;
  abstract deleteBudget(period: PeriodType, label: AccountLabel, range: DateRange): ABudgetForest;
  abstract filter(period: PeriodType | undefined, range: DateRange): ABudgetForest;

  // tentative operations — return new forest + violations without side effects
  abstract tryInsert(period: PeriodType, label: AccountLabel, inst: BudgetInstance): BudgetForestOperationResult;
  abstract tryUpdate(
    period: PeriodType,
    oldLabel: AccountLabel,
    oldRange: DateRange,
    newInst: BudgetInstance,
  ): BudgetForestOperationResult;
  abstract tryDelete(period: PeriodType, label: AccountLabel, range: DateRange): BudgetForestOperationResult;
  abstract validateAll(): ConstraintViolationMap;
}

// ─────────────────────────────────────────────────────────────────────────────
// Period hierarchy constants
// ─────────────────────────────────────────────────────────────────────────────

/** Ordered from largest to smallest — used to guarantee correct insertion order. */
const PERIOD_HIERARCHY: readonly PeriodType[] = ['yearly', 'quarterly', 'monthly'];

/**
 * The period-chain suffix appended to an account label in the unified tree.
 *
 * A monthly budget at `Expenses:Food` becomes `Expenses:Food:yearly:quarterly:monthly`
 * so that yearly is always an ancestor of quarterly, which is always an ancestor
 * of monthly, for every account node.
 */
const PERIOD_PATH_SUFFIX: Record<PeriodType, readonly PeriodType[]> = {
  yearly:    ['yearly'],
  quarterly: ['yearly', 'quarterly'],
  monthly:   ['yearly', 'quarterly', 'monthly'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Concrete implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Holds one {@link BudgetTree} per {@link PeriodType} (monthly / quarterly /
 * yearly).  The forest is immutable: every mutating method returns a new
 * instance.
 *
 * Only {@link insertBudget} is functional.  All other abstract methods are
 * stubs that throw "not implemented" until the design is settled.
 */
export class BudgetForest extends ABudgetForest {
  readonly #trees: Map<PeriodType, BudgetTree>;
  readonly #config: ConstraintConfig;

  private constructor(trees: Map<PeriodType, BudgetTree>, config: ConstraintConfig) {
    super();
    this.#trees = trees;
    this.#config = config;
  }

  static createEmpty(config: ConstraintConfig): BudgetForest {
    return new BudgetForest(new Map(), config);
  }

  // ── Implemented ────────────────────────────────────────────────────────────

  getTree(period: PeriodType): BudgetTree | undefined {
    return this.#trees.get(period);
  }

  /**
   * Insert `inst` at `label` into the tree for `period`.
   * If no tree exists for this period yet, one is created whose root segment
   * is taken from the first element of `label` (e.g. "Expenses").
   */
  insertBudget(period: PeriodType, label: AccountLabel, inst: BudgetInstance): BudgetForest {
    const rootLabel = makeAccountLabel(label[0]);
    const existing = this.#trees.get(period) ?? BudgetTree.createEmpty(rootLabel, this.#config);
    const updated = existing.insert(label, inst);
    const nextTrees = new Map(this.#trees);
    nextTrees.set(period, updated);
    return new BudgetForest(nextTrees, this.#config);
  }

  // ── Stubs ──────────────────────────────────────────────────────────────────

  deleteBudget(_period: PeriodType, _label: AccountLabel, _range: DateRange): ABudgetForest {
    throw new Error("BudgetForest.deleteBudget: not implemented");
  }

  filter(period: PeriodType | undefined, range: DateRange): BudgetForest {
    if (period === undefined) {
      const nextTrees = new Map<PeriodType, BudgetTree>();
      for (const [p, tree] of this.#trees) {
        nextTrees.set(p, tree.filter(range)); // filter ALL trees
      }
      return new BudgetForest(nextTrees, this.#config);
    }
    const nextTrees = new Map<PeriodType, BudgetTree>();
    for (const [p, tree] of this.#trees) {
      // If a specific period was requested, only filter that tree;
      // leave all others untouched.
      if (p === period) {
        nextTrees.set(p, tree.filter(range));
      }
    }
    return new BudgetForest(nextTrees, this.#config);
  }

  tryInsert(_period: PeriodType, _label: AccountLabel, _inst: BudgetInstance): BudgetForestOperationResult {
    throw new Error("BudgetForest.tryInsert: not implemented");
  }

  tryUpdate(
    _period: PeriodType,
    _oldLabel: AccountLabel,
    _oldRange: DateRange,
    _newInst: BudgetInstance,
  ): BudgetForestOperationResult {
    throw new Error("BudgetForest.tryUpdate: not implemented");
  }

  tryDelete(_period: PeriodType, _label: AccountLabel, _range: DateRange): BudgetForestOperationResult {
    throw new Error("BudgetForest.tryDelete: not implemented");
  }

  validateAll(): ConstraintViolationMap {
    const unified = this.buildUnifiedTree();
    return unified ? unified.validateTree() : {};
  }

  /**
   * Get all nodes for account label by period type.
   * Useful for validation.
   */
  getNodesByPeriod(label: AccountLabel): Partial<Record<PeriodType, BudgetTreeNode[]>> {
    const result: Partial<Record<PeriodType, BudgetTreeNode[]>> = {};
    for (const [period, tree] of this.#trees) {
      const node = findNode(tree.root, label);
      if (node !== undefined) {
        result[period] = [node];
      }
    }
    return result;
  }

  // TODO: create a method that traverses the tree and adds amounts to ghost nodes
  // so that all nodes have amounts
  /**
   * Build a single {@link BudgetTree} that unifies all period-specific trees.
   *
   * Each budget's account path is extended with the period-hierarchy chain so
   * that higher-frequency periods are children of lower-frequency ones:
   *
   * ```
   * Expenses:Food (yearly)   → Expenses:Food:yearly
   * Expenses:Food (quarterly) → Expenses:Food:yearly:quarterly
   * Expenses:Food (monthly)  → Expenses:Food:yearly:quarterly:monthly
   * ```
   *
   * Child accounts follow their own period chain underneath the parent account:
   *
   * ```
   * Expenses:Food:Groceries (monthly)
   *   → Expenses:Food:Groceries:yearly:quarterly:monthly
   * ```
   *
   * Ghost (linkage) nodes are created automatically by {@link BudgetTree.insert}
   * for every intermediate segment that has no budget.
   *
   * Returns `null` when the forest is empty.
   */
  buildUnifiedTree(): BudgetTree | null {
    // Find the root segment from any existing per-period tree.
    let rootSegment: string | null = null;
    for (const period of PERIOD_HIERARCHY) {
      const tree = this.#trees.get(period);
      if (tree !== undefined) {
        rootSegment = tree.root.accountLabel[0];
        break;
      }
    }
    if (rootSegment === null) return null;

    let unified = BudgetTree.createEmpty(makeAccountLabel(rootSegment), this.#config);

    // Process yearly → quarterly → monthly so that parent period nodes are
    // always inserted before their child period nodes.
    for (const period of PERIOD_HIERARCHY) {
      const tree = this.#trees.get(period);
      if (tree === undefined) continue;

      for (const { label, inst } of collectBudgetsWithLabels(tree.root)) {
        const extendedPath = [...label, ...PERIOD_PATH_SUFFIX[period]].join(':');
        unified = unified.insert(makeAccountLabel(extendedPath), inst);
      }
    }

    return unified;
  }
}

function findNode(node: BudgetTreeNode, target: AccountLabel): BudgetTreeNode | undefined {
  if (labelEquals(node.accountLabel, target)) return node;
  for (const child of node.children) {
    const found = findNode(child, target);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * DFS over `node` and all descendants, collecting every `BudgetInstance`
 * together with the full `AccountLabel` of the node it lives on.
 */
function collectBudgetsWithLabels(
  node: BudgetTreeNode,
): Array<{ label: AccountLabel; inst: BudgetInstance }> {
  const result: Array<{ label: AccountLabel; inst: BudgetInstance }> = [];
  for (const inst of node.budgets) {
    result.push({ label: node.accountLabel, inst });
  }
  for (const child of node.children) {
    result.push(...collectBudgetsWithLabels(child));
  }
  return result;
}