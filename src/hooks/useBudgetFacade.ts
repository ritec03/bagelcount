/**
 * `useBudgetFacade` — the single source of truth for budget data in the UI.
 *
 * Owns the `BudgetFacade` instance for the lifetime of the component that
 * mounts it.  Fetches raw budgets from the API, initializes the facade, and
 * exposes both the full `ExtendedBudget[]` list and the facade itself so that
 * child components can call `addBudget` / `updateBudget` / `removeBudget`.
 *
 * ## Constraint configuration
 * Hardcoded below in `CONSTRAINT_CONFIG`.  To add a new constraint:
 * 1. Add it to `ConstraintRegistry` in `constraints.ts`.
 * 2. Add its config entry here.
 * 3. Add a message formatter in `constraintMessages.ts`.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { getBudgetsApiV1BudgetsGet as getBudgets } from '../lib/api/sdk.gen';
import { createBudgetFacade } from '../lib/budgets/budgetFacadeImpl';
import type { BudgetFacade, ExtendedBudget } from '../lib/budgets/budgetOperationsFacade';
import type { ConstraintConfig } from '../lib/budgets/constraints/constraints';
import type { StandardBudgetOutput } from '../lib/models/types';

// ─────────────────────────────────────────────────────────────────────────────
// Constraint configuration (hardcoded; extend here as new constraints arrive)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hardcoded constraint configuration.
 *
 * `ParentChildrenSum`:
 *   - `parent`: when the sum of children exceeds the parent budget →
 *     warning on the parent (non-blocking; surface visually but don't block).
 *   - `child`:  when a child's amount exceeds the parent budget →
 *     warning on the child (non-blocking).
 *
 * Change either value to `'blocking'` to prevent the mutation from committing
 * when the constraint is violated.
 */
export const CONSTRAINT_CONFIG: ConstraintConfig = {
  ParentChildrenSum: {
    parent: 'warning',
    child: 'warning',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export interface UseBudgetFacadeResult {
  /** All budgets known to the facade, with constraint warnings attached. */
  allBudgets: ExtendedBudget[];
  /** True while the initial fetch is in flight. */
  isLoading: boolean;
  /** Non-null if the fetch failed. */
  error: Error | null;
  /** The facade instance — call `addBudget`, `updateBudget`, `removeBudget`
   *  directly on it and then call `refresh` to re-sync state. */
  facade: BudgetFacade;
  /** Re-fetches raw budgets from the API and re-initializes the facade. */
  refresh: () => Promise<void>;
}

export function useBudgetFacade(): UseBudgetFacadeResult {
  // Keep a single, stable facade instance for the component's lifetime.
  const facadeRef = useRef<BudgetFacade>(createBudgetFacade());

  const [allBudgets, setAllBudgets] = useState<ExtendedBudget[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await getBudgets({ query: {} });
      // The API returns BudgetAllocation[] which is a superset of
      // StandardBudgetOutput[]; we only feed standard budgets to the facade.
      const raw: StandardBudgetOutput[] = (data ?? []).filter(
        (b): b is StandardBudgetOutput => 'frequency' in b,
      );

      // Deduplicate: the API may return historical revisions (multiple entries
      // per account with matching or null end_dates). Keep only the most
      // recently-started budget per account so the tree doesn't see overlapping
      // instances for the same node.
      // TODO harmonize backend budget representation and this ones
      const latestByAccount = new Map<string, StandardBudgetOutput>();
      for (const b of raw) {
        const existing = latestByAccount.get(b.account);
        if (!existing || b.start_date > existing.start_date) {
          latestByAccount.set(b.account, b);
        }
      }
      const dedupedRaw = [...latestByAccount.values()];

      const extended = facadeRef.current.initializeBudgets(dedupedRaw, CONSTRAINT_CONFIG);
      setAllBudgets(extended);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error fetching budgets'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    allBudgets,
    isLoading,
    error,
    facade: facadeRef.current,
    refresh,
  };
}
