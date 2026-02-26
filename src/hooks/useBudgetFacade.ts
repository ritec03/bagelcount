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

import { useEffect, useState, useCallback, useContext, useSyncExternalStore } from 'react';
import { getBudgetsApiV1BudgetsGet as getBudgets } from '../lib/api/sdk.gen';
import type { BudgetFacade, ExtendedBudget } from '../lib/budgets/service/budgetManagerInterface';
import type { ConstraintConfig } from '../lib/budgets/constraints/constraints';
import type { StandardBudgetOutput } from '../lib/models/types';
import { BudgetManagerContext } from '@/components/context';

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

export interface UseBudgetFacadeResult {
  allBudgets: ExtendedBudget[];
  isLoading: boolean;
  error: Error | null;
  facade: BudgetFacade;
  refresh: () => Promise<void>;
}

export function useBudgetFacade(): UseBudgetFacadeResult {
  const budgetFacade = useContext(BudgetManagerContext);

  if (!budgetFacade) {
    throw new Error("useBudgetFacade must be used within a BudgetManagerContext Provider");
  }

  // 1. ✨ MAGIC HAPPENS HERE ✨
  // We replace useState with useSyncExternalStore. 
  // Now, `allBudgets` is always perfectly in sync with the facade's internal state.
  const allBudgets = useSyncExternalStore(
    budgetFacade.subscribe,
    budgetFacade.getBudgetsSnapshot
  );

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await getBudgets({ query: {} });
      
      const raw: StandardBudgetOutput[] = (data ?? []).filter(
        (b): b is StandardBudgetOutput => 'frequency' in b,
      );

      const latestByAccount = new Map<string, StandardBudgetOutput>();
      for (const b of raw) {
        const existing = latestByAccount.get(b.account);
        if (!existing || b.start_date > existing.start_date) {
          latestByAccount.set(b.account, b);
        }
      }
      const dedupedRaw = [...latestByAccount.values()];

      // 2. We no longer set local state here. 
      // We just tell the facade to initialize itself. 
      // Inside `initializeBudgets`, the facade will update its internal tree, 
      // generate a new snapshot, and notify listeners. 
      // `useSyncExternalStore` catches that notification and updates the UI automatically!
      budgetFacade.initializeBudgets(dedupedRaw, CONSTRAINT_CONFIG);
      
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error fetching budgets'));
    } finally {
      setIsLoading(false);
    }
  }, [budgetFacade]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    allBudgets,
    isLoading,
    error,
    facade: budgetFacade,
    refresh,
  };
}