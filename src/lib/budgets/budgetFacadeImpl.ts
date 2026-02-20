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

import type { StandardBudgetOutput } from '../types';
import { makeAccountLabel } from './accountLabel';
import { BudgetInstance } from './budgetInstance';
import { BudgetTreeNode } from './budgetNode';
import { BudgetTree } from './budgetTree';
import type {
  Constraint,
  ConstraintConfig,
  ConstraintMode,
  ConstraintViolationMap,
} from './constraints';
import { DateRange } from './dateRange';
import { NaiveDate } from './dateUtil';
import type {
  BudgetFacade,
  ExtendedBudget,
  OperationFailure,
  OperationResult,
  OperationSuccess,
} from './budgetOperationsFacade';

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
function rawToInstance(raw: StandardBudgetOutput): BudgetInstance {
  const start = NaiveDate.fromString(raw.start_date);
  const end   = raw.end_date !== null ? NaiveDate.fromString(raw.end_date) : null;
  return new BudgetInstance(new DateRange(start, end), parseFloat(raw.amount), raw.id);
}

/**
 * Build a `ConstraintViolationMap` containing only warnings whose role mode
 * matches the given predicate.  Used to split a combined violation map into
 * `errors` (blocking) vs `warnings` (non-blocking) for mutation results.
 */
function filterViolationsByMode(
  violations: ConstraintViolationMap,
  config: ConstraintConfig,
  predicate: (mode: ConstraintMode) => boolean,
): ConstraintViolationMap {
  const result: ConstraintViolationMap = {};
  for (const key of Object.keys(violations) as Constraint[]) {
    const warns = violations[key];
    if (!warns || warns.length === 0) continue;
    const cfg = config[key];
    const filtered = warns.filter((w) => predicate(cfg[w.role as keyof typeof cfg]));
    if (filtered.length > 0) {
      // Safe cast: filtered items belong to the same constraint key.
      (result as Record<Constraint, unknown>)[key] = filtered;
    }
  }
  return result;
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
 * (either as the primary `budgetId` or as `exceedingChildIds`).
 */
function affectedIds(violations: ConstraintViolationMap): Set<string> {
  const ids = new Set<string>();
  for (const key of Object.keys(violations) as Constraint[]) {
    const warns = violations[key];
    if (!warns) continue;
    for (const w of warns) {
      ids.add(w.budgetId);
      if ('exceedingChildIds' in w) {
        for (const cid of w.exceedingChildIds) ids.add(cid);
      }
      if ('parentId' in w) ids.add(w.parentId);
    }
  }
  return ids;
}

/** Walk the entire tree and collect every `BudgetInstance` into a flat array. */
function collectAllInstances(
  node: BudgetTreeNode,
): Array<{ instance: BudgetInstance; node: BudgetTreeNode }> {
  const result: Array<{ instance: BudgetInstance; node: BudgetTreeNode }> = [];
  for (const inst of node.budgets) {
    result.push({ instance: inst, node });
  }
  for (const child of node.children) {
    result.push(...collectAllInstances(child));
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Concrete class
// ─────────────────────────────────────────────────────────────────────────────

class BudgetFacadeImpl implements BudgetFacade {
  #tree: BudgetTree | null = null;
  /** id → raw StandardBudgetOutput */
  #rawById: Map<string, StandardBudgetOutput> = new Map();
  #config: ConstraintConfig = {
    ParentChildrenSum: { parent: 'disabled', child: 'disabled' },
  };

  // ── initializeBudgets ────────────────────────────────────────────────────

  initializeBudgets(
    rawBudgets: StandardBudgetOutput[],
    config: ConstraintConfig,
  ): ExtendedBudget[] {
    this.#config = config;
    this.#rawById = new Map(rawBudgets.map((r) => [r.id, r]));

    if (rawBudgets.length === 0) {
      // Empty tree: use an empty root. We won't insert anything, so the label
      // doesn't matter. We still need SOME valid AccountLabel for the node.
      this.#tree = BudgetTree.createEmpty(makeAccountLabel('__empty__'), config);
      return [];
    }

    // Derive the single top-level root label from the first segment of the
    // first budget's account (e.g. "Expenses" from "Expenses:Food").
    // The caller guarantees that all budgets share the same top-level account.
    const rootSegment = rawBudgets[0]!.account.split(':')[0]!;
    const rootLabel = makeAccountLabel(rootSegment);
    let tree = BudgetTree.createEmpty(rootLabel, config);

    for (const raw of rawBudgets) {
      const label = makeAccountLabel(raw.account);
      const inst  = rawToInstance(raw);
      tree = tree.insert(label, inst);
    }

    this.#tree = tree;
    return this.#buildExtendedList(rawBudgets);
  }

  // ── getBudgetList ────────────────────────────────────────────────────────

  getBudgetList(range: { start: Date; end: Date }): ExtendedBudget[] {
    if (this.#tree === null) return [];

    // Convert JS Date → NaiveDate via ISO string slice (YYYY-MM-DD).
    const start = NaiveDate.fromString(range.start.toISOString().slice(0, 10));
    const end   = NaiveDate.fromString(range.end.toISOString().slice(0, 10));
    const filtered = this.#tree.filter(new DateRange(start, end));

    // Collect ids present in the filtered tree.
    const entriesInRange = collectAllInstances(filtered.root);
    const visibleIds = new Set(entriesInRange.map((e) => e.instance.id));

    // Preserve original insertion order.
    const visibleRaws = [...this.#rawById.values()].filter((r) => visibleIds.has(r.id));
    return this.#buildExtendedList(visibleRaws);
  }

  // ── addBudget ────────────────────────────────────────────────────────────

  addBudget(budget: StandardBudgetOutput): OperationResult {
    if (this.#tree === null) {
      return this.#failure({ errors: {}, warnings: {} });
    }

    // Duplicate id check.
    if (this.#rawById.has(budget.id)) {
      return this.#failure({ errors: {}, warnings: {} });
    }

    const label = makeAccountLabel(budget.account);
    const inst  = rawToInstance(budget);

    // Lazily bootstrap the tree root when initializeBudgets was called with an
    // empty list (leaving us with the __empty__ placeholder). The real root
    // label is derived from the new budget's account.
    let currentTree = this.#tree;
    if (currentTree.root.accountLabel[0] === '__empty__') {
      const rootSegment = budget.account.split(':')[0]!;
      currentTree = BudgetTree.createEmpty(makeAccountLabel(rootSegment), this.#config);
    }

    // Tentatively insert into the tree.
    let tentativeTree: BudgetTree;
    try {
      tentativeTree = currentTree.insert(label, inst);
    } catch {
      return this.#failure({ errors: {}, warnings: {} });
    }

    // Run validation on the tentative state.
    const allViolations = tentativeTree.validateTree();
    const errors   = filterViolationsByMode(allViolations, this.#config, (m) => m === 'blocking');
    const warnings = filterViolationsByMode(allViolations, this.#config, (m) => m === 'warning');

    if (Object.keys(errors).length > 0) {
      // Blocked — do NOT commit the tentative tree.
      return this.#failure({ errors, warnings });
    }

    // Commit.
    this.#tree = tentativeTree;
    this.#rawById.set(budget.id, budget);

    // Always include the new budget AND its direct parent (so the parent's
    // constraint state is refreshed in the caller, even if no violation exists).
    const changedIds = new Set<string>([budget.id, ...affectedIds(allViolations)]);
    this.#findParentIds(budget.account).forEach((pid) => changedIds.add(pid));
    return this.#success(allViolations, changedIds);
  }

  // ── updateBudget ─────────────────────────────────────────────────────────

  updateBudget(
    id: string,
    patch: Partial<StandardBudgetOutput> & Pick<StandardBudgetOutput, 'id'>,
  ): OperationResult {
    const existing = this.#rawById.get(id);
    if (!existing || this.#tree === null) {
      return this.#failure({ errors: {}, warnings: {} });
    }

    // id-mismatch guard: the patch's id field must agree with the param id.
    if (patch.id !== id) {
      return this.#failure({ errors: {}, warnings: {} });
    }

    // Produce the merged raw.
    const updated: StandardBudgetOutput = { ...existing, ...patch, id };

    // Remove old instance and insert updated one.
    let tentativeTree: BudgetTree;
    try {
      tentativeTree = this.#tree
        .delete(makeAccountLabel(existing.account), rawToInstance(existing).effectiveRange)
        .insert(makeAccountLabel(updated.account), rawToInstance(updated));
    } catch {
      return this.#failure({ errors: {}, warnings: {} });
    }
    const allViolations = tentativeTree.validateTree();
    const errors   = filterViolationsByMode(allViolations, this.#config, (m) => m === 'blocking');
    const warnings = filterViolationsByMode(allViolations, this.#config, (m) => m === 'warning');

    if (Object.keys(errors).length > 0) {
      return this.#failure({ errors, warnings });
    }

    this.#tree = tentativeTree;
    this.#rawById.set(id, updated);

    // Always include the updated budget AND its direct parent so constraint
    // state is refreshed even when no violations are present.
    const changedIds = new Set<string>([id, ...affectedIds(allViolations)]);
    this.#findParentIds(updated.account).forEach((pid) => changedIds.add(pid));
    return this.#success(allViolations, changedIds);
  }

  // ── removeBudget ─────────────────────────────────────────────────────────

  removeBudget(id: string): OperationResult {
    const existing = this.#rawById.get(id);
    if (!existing || this.#tree === null) {
      return this.#failure({ errors: {}, warnings: {} });
    }

    const inst = rawToInstance(existing);
    let tentativeTree: BudgetTree;
    try {
      tentativeTree = this.#tree.delete(
        makeAccountLabel(existing.account),
        inst.effectiveRange,
      );
    } catch {
      return this.#failure({ errors: {}, warnings: {} });
    }

    const allViolations = tentativeTree.validateTree();

    // Removing a child can only reduce the children sum — the
    // ParentChildrenSum constraint never blocks a well-formed removal.
    // Still run validation so sibling/parent warnings are recalculated.

    // Commit.
    this.#tree = tentativeTree;
    this.#rawById.delete(id);

    // Include all budgets affected by the new constraint state, the parent
    // node(s) that lost a child, AND all remaining siblings (so callers can
    // clear or update their constraint warnings after the tree changes).
    const changedIds = new Set<string>(affectedIds(allViolations));
    this.#findParentIds(existing.account).forEach((pid) => changedIds.add(pid));
    this.#findSiblingIds(existing.account).forEach((sid) => changedIds.add(sid));

    // Do NOT include the removed id in updates.
    changedIds.delete(id);

    return this.#success(allViolations, changedIds);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Build an `OperationSuccess` from the current committed tree state.
   * `changedIds` controls which budgets appear in `updates`.
   */
  #success(violations: ConstraintViolationMap, changedIds: Set<string>): OperationSuccess {
    const warningIndex = indexWarningsByBudgetId(violations);
    const updates: Record<string, ExtendedBudget> = {};

    for (const id of changedIds) {
      const raw = this.#rawById.get(id);
      if (!raw) continue; // removed budget — skip
      updates[id] = {
        ...raw,
        warnings: warningIndex.get(id) ?? {},
      };
    }

    return { success: true, updates };
  }

  #failure(payload: { errors: ConstraintViolationMap; warnings: ConstraintViolationMap }): OperationFailure {
    return { success: false, ...payload };
  }

  /**
   * Build an `ExtendedBudget[]` for the given raws in order, using the
   * current tree's violation map to attach per-budget warnings.
   */
  #buildExtendedList(raws: StandardBudgetOutput[]): ExtendedBudget[] {
    const violations    = this.#tree ? this.#tree.validateTree() : {};
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
