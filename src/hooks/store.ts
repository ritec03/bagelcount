import type { ExtendedBudget } from '@/lib/budgets/service/budgetManagerInterface'
import { create } from 'zustand'

/**
 * Zustand store that holds extended budget list.
 */

export type AppState = {
    budgetList: ExtendedBudget[];
    updateBudgetList: (newBudgetList: ExtendedBudget[]) => void;
}

export const useAppStore = create<AppState>((set) => ({
  budgetList: [],
  updateBudgetList: (newBudgetList: ExtendedBudget[]) => set(() => ({ budgetList: newBudgetList })),
}))