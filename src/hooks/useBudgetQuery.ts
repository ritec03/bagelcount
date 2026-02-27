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

import { useEffect, useContext, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBudgetsApiV1BudgetsGet as getBudgets } from '../lib/api/sdk.gen';
import type { BudgetAllocation, StandardBudgetOutput } from '../lib/models/types';
import { BudgetManagerContext, ConstraintConfigContext } from '@/components/context';
import { useAppStore } from './store';

export interface UseBudgetQueryResult {
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useBudgetQueryBasic(filters: {   
    date?: string; 
    startDate?: string;
    endDate?: string; 
} = {}) {
    return useQuery<BudgetAllocation[], Error>({
        queryKey: ['budgets', 'filtered', filters.date, filters.startDate, filters.endDate],
        queryFn: async () => {
            const { data } = await getBudgets({
                query: {
                    date: filters.date,
                    start_date: filters.startDate,
                    end_date: filters.endDate
                }
            });
            return data ?? [];
        }
    });
}

export function useBudgetQuery() {
  const budgetFacade = useContext(BudgetManagerContext);
  const CONSTRAINT_CONFIG = useContext(ConstraintConfigContext);
  const updateBudgetList = useAppStore(state => state.updateBudgetList);
  const [isInitialized, setIsInitialized] = useState(false);

  const { data, isLoading, error } = useBudgetQueryBasic();

  // Sync facade changes to Zustand
  useEffect(() => {
    return budgetFacade.subscribe(() => {
      updateBudgetList(budgetFacade.getBudgetsSnapshot());
    });
  }, [budgetFacade, updateBudgetList]);

  // Process and initialize facade
  useEffect(() => {
    if (!data) return;

    const raw = data.filter((b): b is StandardBudgetOutput => 'frequency' in b);

    const latestByAccount = new Map<string, StandardBudgetOutput>();
    for (const b of raw) {
      const existing = latestByAccount.get(b.account);
      if (!existing || b.start_date > existing.start_date) {
        latestByAccount.set(b.account, b);
      }
    }

    budgetFacade.initializeBudgets([...latestByAccount.values()], CONSTRAINT_CONFIG);
    console.log(budgetFacade.getBudgetsSnapshot());
    queueMicrotask(() => setIsInitialized(true));
  }, [data, budgetFacade, CONSTRAINT_CONFIG]);

  return {
    isLoading: isLoading || !isInitialized,
    error,
  };
}