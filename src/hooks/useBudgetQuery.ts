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

import { useEffect, useContext, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBudgetsApiV1BudgetsGet as getBudgets } from '../lib/api/sdk.gen';
import type { ConstraintConfig } from '../lib/budgets/constraints/constraints';
import type { StandardBudgetOutput } from '../lib/models/types';
import { BudgetManagerContext } from '@/components/context';
import { useAppStore } from './store';

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

export interface UseBudgetQueryResult {
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useBudgetQuery(): UseBudgetQueryResult {
  const budgetFacade = useContext(BudgetManagerContext);

  if (!budgetFacade) {
    throw new Error("useBudgetFacade must be used within a BudgetManagerContext Provider");
  }

  const updateBudgetList = useAppStore(state => state.updateBudgetList);

  // Sync facade changes to the Zustand store
  useEffect(() => {
    return budgetFacade.subscribe(() => {
      updateBudgetList(budgetFacade.getBudgetsSnapshot());
    });
  }, [budgetFacade, updateBudgetList]);

  // Use TanStack Query to manage the API call
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['budgets'],
    queryFn: async () => {
      const { data } = await getBudgets({ query: {} });
      return data;
    },
  });

  useEffect(() => {
    if (data) {
      const raw: StandardBudgetOutput[] = data.filter(
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

      // Initialize the facade, which updates its internal tree and triggers
      // listeners, causing the store subscription to update Zustand.
      budgetFacade.initializeBudgets(dedupedRaw, CONSTRAINT_CONFIG);
    }
  }, [data, budgetFacade]);

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    isLoading,
    error,
    refresh,
  };
}