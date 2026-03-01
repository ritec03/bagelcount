/**
 * Concrete implementation of {@link BudgetFacade}.
 *
 * Internal state
 * ──────────────
 * - `tree`:    The `BudgetTree` holding all loaded budgets.  All mutation
 *              methods produce a new tree (immutable); the field is replaced
 *              on success.
 * - `rawById`: A flat `Map<id, StandardBudgetOutput>` so we can re-hydrate
 *              `ExtendedBudget` objects quickly after a tree operation.
 * - `config`:  Captured once in `initializeBudgets` and reused for all
 *              subsequent mutation operations.
 */

import { isStandardBudget, type BudgetAllocation, type BudgetType, type CustomBudgetOutput, type PeriodType, type StandardBudgetOutput } from '../../models/types';
import { makeAccountLabel, type AccountLabel } from '../core/accountLabel';
import { BudgetInstance } from '../core/budgetInstance';
import { BudgetTreeNode } from '../core/budgetNode';
import type {
  Constraint,
  ConstraintConfig,
  ConstraintViolationMap,
} from '../constraints/constraints';
import { DateRange, overlap } from '../../utils/dateRange';
import { NaiveDate } from '../../utils/dateUtil';
import { normalizeBudgetAmount } from '../../budgetCalculations';
import type {
  BudgetFacade,
  ExtendedBudget,
  OperationResult,
} from './budgetManagerInterface';
import type { ABudgetForest } from '../core/budgetForest';
import { BudgetForest } from '../core/budgetForest';

// ─────────────────────────────────────────────────────────────────────────────
// Factory function (the public entry point)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a fresh, empty {@link BudgetFacade}.
 *
 * Call {@link BudgetFacade.initializeBudgets} after construction to load data.
 */
export function createBudgetFacade(): BudgetFacade {
  return new BudgetFacadeImpl();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Parse a `StandardBudgetOutput` into a `BudgetInstance` for tree internals. */
function rawToInstance(raw: BudgetAllocation): BudgetInstance {
  const start = NaiveDate.fromString(raw.start_date);
  const end   = raw.end_date !== null && raw.end_date !== undefined ? NaiveDate.fromString(raw.end_date) : null;
  return new BudgetInstance(new DateRange(start, end), parseFloat(raw.amount), raw.id);
}


/**
 * Distribute a flat `ConstraintViolationMap` (keyed by constraint, each entry
 * a list of warnings referencing `budgetId`) into a per-id map
 * `Map<budgetId, ConstraintViolationMap>`.
 */
function indexWarningsByBudgetId(
  violations: ConstraintViolationMap,
): Map<string, ConstraintViolationMap> {
  const index = new Map<string, ConstraintViolationMap>();

  for (const key of Object.keys(violations) as Constraint[]) {
    const warns = violations[key];
    if (!warns) continue;
    for (const w of warns) {
      const existing = index.get(w.budgetId) ?? {};
      const arr = (existing as Record<Constraint, unknown>)[key] as typeof warns | undefined;
      (existing as Record<Constraint, unknown>)[key] = arr ? [...arr, w] : [w];
      index.set(w.budgetId, existing);
    }
  }

  return index;
}

/**
 * Collect the set of budget ids that are referenced by a `ConstraintViolationMap`

/** Walk the entire tree and collect every `BudgetInstance` into a flat array. */
function collectAllInstances(
  node: BudgetTreeNode,
): Array<BudgetInstance> {
  const result: Array<BudgetInstance> = [];
  for (const inst of node.budgets) {
    result.push(inst);
  }
  for (const child of node.children) {
    result.push(...collectAllInstances(child));
  }
  return result;
}

const ALL_PERIODS: PeriodType[] = ['monthly', 'quarterly', 'yearly'];

function collectAllInstancesInForest(
  forest: ABudgetForest,
): Array<BudgetInstance> {
  const result: Array<BudgetInstance> = [];
  for (const period of ALL_PERIODS) {
    const tree = forest.getTree(period);
    if (tree !== undefined) {
      result.push(...collectAllInstances(tree.root));
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Concrete class
// ─────────────────────────────────────────────────────────────────────────────

class BudgetFacadeImpl implements BudgetFacade {
  #customBudgets: (BudgetInstance & {accountLabel: AccountLabel})[] = [];
  #forest: ABudgetForest | null = null;
  /** id → raw StandardBudgetOutput */
  #rawById: Map<string, StandardBudgetOutput | CustomBudgetOutput> = new Map();


  // TODO remove state and listeners from budget facade

  // Create a Set to hold listener callbacks
  #listeners = new Set<() => void>();
  #snapshotCache: ExtendedBudget[] = [];

  // Create the subscribe method (React will pass the listener function here)
  subscribe = (listener: () => void) => {
      this.#listeners.add(listener);
      // React requires the subscribe function to return an unsubscribe function!
      return () => {
          this.#listeners.delete(listener);
      };
  };

  // React calls this to get the data. It returns the exact same reference 
  // UNLESS the tree has been modified.
  getBudgetsSnapshot = () => {

      return this.#snapshotCache;
  };

  #updateCacheAndNotifyListeners() {
        // TODO: fix this - make getBudgetList method accept no range.
        this.#snapshotCache = this.getBudgetList({start: new Date("2000-01-01"), end: new Date("2100-01-01")});
        this.#listeners.forEach((listener) => listener());
    }

  // ── initializeBudgets ────────────────────────────────────────────────────

  initializeBudgets(
    rawBudgets: BudgetAllocation[],
    config: ConstraintConfig,
  ): ExtendedBudget[] {
    this.#rawById = new Map(rawBudgets.map((r) => [r.id, r]));

    if (rawBudgets.length === 0) {
      this.#forest = BudgetForest.createEmpty(config);
      this.#customBudgets = [];
      return [];
    }

    // Sort alphabetically so that ancestors are always inserted before their
    // descendants (BudgetTree.insert requires the parent node to exist first).
    const sorted = [...rawBudgets].sort((a, b) => a.account.localeCompare(b.account));

    // Group by top-level root segment (e.g. "Expenses", "Income", "Assets").
    // The tree is rooted at one segment; budgets from different roots need
    // separate trees. For the UI we use only the largest group (Expenses).
    // See TODO below
    const groups = new Map<string, BudgetAllocation[]>();
    for (const raw of sorted) {
      const root = raw.account.split(':')[0]!;
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(raw);
    }

    // Pick the group with the most budgets (typically "Expenses").
    // TODO: support multiple roots if the UI ever needs Income/Assets trees.
    const primaryGroup = [...groups.values()].reduce(
      (best, g) => (g.length > best.length ? g : best),
      [],
    );

    if (primaryGroup.length === 0) {
      this.#forest = BudgetForest.createEmpty(config);
      this.#customBudgets = [];
      return [];
    }

    let forest = BudgetForest.createEmpty(config);

    for (const raw of primaryGroup) {
      const label = makeAccountLabel(raw.account);
      const inst  = rawToInstance(raw);
      if (isStandardBudget(raw)) {
        forest = forest.insertBudget(raw.frequency, label, inst);
      } else {
        this.#customBudgets.push({...inst, accountLabel: makeAccountLabel(raw.account)})
      }
    }

    this.#forest = forest;

    this.#updateCacheAndNotifyListeners();
    return this.#buildExtendedList(primaryGroup);
  }

  // ── getBudgetList ────────────────────────────────────────────────────────

  getBudgetList(range: { start: Date; end: Date }): ExtendedBudget[] {
    if (this.#forest === null) return [];

    // Convert JS Date → NaiveDate via ISO string slice (YYYY-MM-DD).
    const start = NaiveDate.fromString(range.start.toISOString().slice(0, 10));
    const end   = NaiveDate.fromString(range.end.toISOString().slice(0, 10));
    const filtered = this.#forest.filter(undefined, new DateRange(start, end));

    // Collect ids present in the filtered tree.
    const entriesInRange = collectAllInstancesInForest(filtered);
    const visibleIds = new Set(entriesInRange.map((e) => e.id));

    // Preserve original insertion order.
    const visibleRaws = [...this.#rawById.values()].filter((r) => visibleIds.has(r.id));
    return this.#buildExtendedList(visibleRaws);
  }

  // ── getActiveBudgets ─────────────────────────────────────────────────────

  // @typescript-eslint/no-unused-vars
  getActiveBudgets(periodTypeOrCustom: BudgetType, target: NaiveDate, _dummyBudgetInput: ExtendedBudget[]): ExtendedBudget[] {
    if (this.#forest === null) return [];
    let visibleIds: Set<string>;

    if (periodTypeOrCustom === 'custom') {
      // filter custom budgets
      const filteredCustomBudgets = [];
      for (const budget of this.#customBudgets) {
        if (overlap(budget.effectiveRange, new DateRange(target, target))) {
          filteredCustomBudgets.push(budget)
        }
      }
      visibleIds = new Set(filteredCustomBudgets.map((e) => e.id));
    } else {
      const filtered = this.#forest.filter(periodTypeOrCustom, new DateRange(target, target));
      visibleIds = new Set(collectAllInstancesInForest(filtered).map((e) => e.id));
    }


    const customRaws = [...this.#rawById.values()].filter(
      (r) => visibleIds.has(r.id)
    );
    return this.#buildExtendedList(customRaws);
  }

  // ── normalizeAmount ──────────────────────────────────────────────────────

  normalizeAmount(amount: number, frequency: PeriodType, targetPeriod: PeriodType): number {
    return normalizeBudgetAmount(amount, frequency, targetPeriod);
  }

  // ── addBudget ────────────────────────────────────────────────────────────

  addBudget(budget: BudgetAllocation): OperationResult {
    return this.addBudgetGeneral(budget, true);
  }

  previewAddBudget(budget: StandardBudgetOutput): OperationResult {
    return this.addBudgetGeneral(budget, false);
  }
  // ── previewAddBudget ─────────────────────────────────────────────────────

  addBudgetGeneral(budget: BudgetAllocation, isPreview: boolean) : OperationResult  {
    if (this.#forest == null) {
      return { success: false, errors: {}, warnings: {} };
    }
    // Reject duplicate IDs — each budget must have a unique ID.
    if (this.#rawById.has(budget.id)) {
      return { success: false, errors: {}, warnings: {} };
    }

    const instance = new BudgetInstance(
      new DateRange(
        NaiveDate.fromString(budget.start_date),
        budget.end_date ? NaiveDate.fromString(budget.end_date) : null,
      ),
      Number(budget.amount),
      budget.id,
    );

    if (isStandardBudget(budget)) {
      const result = this.#forest.tryInsert(budget.frequency, makeAccountLabel(budget.account), instance);
      if (!result.success) return result;

      if (isPreview) {
        this.#forest = result.forest;
        this.#rawById.set(budget.id, budget);
      }

      // Build ExtendedBudgets for the new budget + every parent/sibling whose
      // warning state may have changed after the insertion.
      const affectedIds = new Set<string>([]);
      this.#findParentIds(budget.account).forEach((id) => affectedIds.add(id));
      this.#findSiblingIds(budget.account).forEach((id) => affectedIds.add(id));

      const affectedRaws = [...affectedIds]
        .map((id) => this.#rawById.get(id))
        .filter((r): r is BudgetAllocation => r !== undefined);

      const updates: Record<string, ExtendedBudget> = {};
      const tentativeViolations = result.forest.validateAll();
      for (const ext of this.#buildExtendedList([...affectedRaws, budget], tentativeViolations)) {
        updates[ext.id] = ext;
      }

      this.#updateCacheAndNotifyListeners();
      return { success: true, updates };
    } else {
      this.#customBudgets.push({ ...instance, accountLabel: makeAccountLabel(budget.account) });
      this.#rawById.set(budget.id, budget);
      return { success: true, updates: { [budget.id]: { ...budget, warnings: {} } } };
    }
  }

  // ── previewUpdateBudget ──────────────────────────────────────────────────

  previewUpdateBudget(
    id: string,
    patch: Partial<StandardBudgetOutput> & Pick<StandardBudgetOutput, 'id'>,
  ): OperationResult {
    return this.updateBudgetGeneral(id, patch, false);
  }

  // ── updateBudget ─────────────────────────────────────────────────────────

  updateBudget(
    id: string,
    patch: Partial<StandardBudgetOutput> & Pick<StandardBudgetOutput, 'id'>,
  ): OperationResult {
    return this.updateBudgetGeneral(id, patch, true);
  }

  /**
   * Shared logic for update and preview-update.
   *
   * @param commit - when true the change is persisted; when false it is a
   *                 dry-run (no state mutation).
   */
  updateBudgetGeneral(
    id: string,
    patch: Partial<StandardBudgetOutput> & Pick<StandardBudgetOutput, 'id'>,
    commit: boolean,
  ): OperationResult {
    if (this.#forest == null) {
      return { success: false, errors: {}, warnings: {} };
    }

    const existing = this.#rawById.get(id);
    if (!existing || patch.id !== id) {
      return { success: false, errors: {}, warnings: {} };
    }

    if (!isStandardBudget(existing)) {
      // Custom budgets are not yet supported for updates via the forest path.
      return { success: false, errors: {}, warnings: {} };
    }

    const updated: StandardBudgetOutput = { ...existing, ...patch, id } as StandardBudgetOutput;

    const oldInst  = rawToInstance(existing);
    const newInst  = rawToInstance(updated);
    const oldLabel = makeAccountLabel(existing.account);
    const newLabel = makeAccountLabel(updated.account);

    const result = this.#forest.tryUpdate(
      existing.frequency,
      oldLabel,
      oldInst.effectiveRange,
      newLabel,
      newInst,
    );

    if (!result.success) return result;

    if (commit) {
      // Commit — replace the forest and update the raw index.
      this.#forest = result.forest;
      this.#rawById.set(id, updated);
    }

    // Build ExtendedBudgets for the updated budget + affected ancestors/siblings.
    const affectedIds = new Set<string>([id]);
    this.#findParentIds(updated.account).forEach((aid) => affectedIds.add(aid));
    this.#findSiblingIds(updated.account).forEach((aid) => affectedIds.add(aid));

    // For a preview the updated budget isn't in #rawById yet, so supply it directly.
    const rawsToRender: BudgetAllocation[] = [];
    for (const aid of affectedIds) {
      if (aid === id) {
        rawsToRender.push(updated);
      } else {
        const r = this.#rawById.get(aid);
        if (r !== undefined) rawsToRender.push(r);
      }
    }

    const updates: Record<string, ExtendedBudget> = {};
    const tentativeViolations = result.forest.validateAll();
    for (const ext of this.#buildExtendedList(rawsToRender, tentativeViolations)) {
      updates[ext.id] = ext;
    }

    if (commit) this.#updateCacheAndNotifyListeners();
    return { success: true, updates };
  }



  // ── removeBudget ─────────────────────────────────────────────────────────

  removeBudget(id: string): OperationResult {
    if (this.#forest == null) {
      return { success: false, errors: {}, warnings: {} };
    }

    const existing = this.#rawById.get(id);
    if (!existing) {
      return { success: false, errors: {}, warnings: {} };
    }

    if (!isStandardBudget(existing)) {
      // TODO: handle custom budget removal
      return { success: false, errors: {}, warnings: {} };
    }

    const inst = rawToInstance(existing);
    let nextForest: ABudgetForest;
    try {
      nextForest = this.#forest.deleteBudget(
        existing.frequency,
        makeAccountLabel(existing.account),
        inst.effectiveRange,
      );
    } catch {
      return { success: false, errors: {}, warnings: {} };
    }

    // Commit — removal never introduces violations, so no blocking check needed.
    this.#forest = nextForest;
    this.#rawById.delete(id);

    // Build updates for parents + siblings whose warning state may have changed.
    // The removed budget itself is intentionally excluded from updates.
    const affectedIdSet = new Set<string>();
    this.#findParentIds(existing.account).forEach((pid) => affectedIdSet.add(pid));
    this.#findSiblingIds(existing.account).forEach((sid) => affectedIdSet.add(sid));

    const rawsToRender: BudgetAllocation[] = [...affectedIdSet]
      .map((aid) => this.#rawById.get(aid))
      .filter((r): r is BudgetAllocation => r !== undefined);

    const updates: Record<string, ExtendedBudget> = {};
    for (const ext of this.#buildExtendedList(rawsToRender)) {
      updates[ext.id] = ext;
    }

    this.#updateCacheAndNotifyListeners();
    return { success: true, updates };
  }


  // ── Private helpers ───────────────────────────────────────────────────────



  /**
   * Build an `ExtendedBudget[]` for the given raws in order, using the
   * current tree's violation map to attach per-budget warnings.
   */
  #buildExtendedList(
    raws: BudgetAllocation[],
    overrideViolations?: ConstraintViolationMap
  ): ExtendedBudget[] {
    const violations    = overrideViolations ?? (this.#forest ? this.#forest.validateAll() : {});
    const warningIndex  = indexWarningsByBudgetId(violations);

    return raws.map((raw) => ({
      ...raw,
      warnings: warningIndex.get(raw.id) ?? {},
    }));
  }

  /**
   * Find the ids of BudgetInstances whose account is the direct parent of
   * `account` in the hierarchy.
   *
   * E.g. for `Expenses:Food:Restaurants`, the direct parent account is
   * `Expenses:Food`, and we return all instance ids for that account node.
   */
  #findParentIds(account: string): string[] {
    const segments = account.split(':');
    if (segments.length <= 1) return [];
    const parentAccount = segments.slice(0, -1).join(':');
    const ids: string[] = [];
    for (const raw of this.#rawById.values()) {
      if (raw.account === parentAccount) ids.push(raw.id);
    }
    return ids;
  }

  /**
   * Find the ids of budgets that are siblings of `account` — i.e. they share
   * the same direct parent account but are NOT `account` itself.
   *
   * E.g. for `Expenses:Food`, siblings are other direct children of `Expenses`
   * such as `Expenses:Transport`.
   */
  #findSiblingIds(account: string): string[] {
    const segments = account.split(':');
    if (segments.length <= 1) return []; // top-level account has no siblings tracked here
    const parentAccount = segments.slice(0, -1).join(':');
    const ids: string[] = [];
    for (const raw of this.#rawById.values()) {
      const rawSegs = raw.account.split(':');
      // Same parent and same depth but different account
      if (
        rawSegs.length === segments.length &&
        raw.account !== account &&
        rawSegs.slice(0, -1).join(':') === parentAccount
      ) {
        ids.push(raw.id);
      }
    }
    return ids;
  }
}
