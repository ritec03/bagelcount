import type { ExtendedBudget } from "@/lib/budgets/service/budgetManagerInterface";
import type { NormalizationMode, PeriodType } from "@/lib/models/types";
import { create } from "zustand";

/**
 * Zustand store that holds extended budget list.
 */

export type AppState = {
  budgetList: ExtendedBudget[];
  updateBudgetList: (newBudgetList: ExtendedBudget[]) => void;

  // View state
  viewDate: Date;
  setViewDate: (date: Date) => void;

  periodType: PeriodType;
  setPeriodType: (periodType: PeriodType) => void;

  normalizationMode: NormalizationMode;
  setNormalizationMode: (mode: NormalizationMode) => void;
};

export const useAppStore = create<AppState>((set) => ({
  budgetList: [],
  updateBudgetList: (newBudgetList: ExtendedBudget[]) =>
    set(() => ({ budgetList: newBudgetList })),

  viewDate: new Date(),
  setViewDate: (date) => set({ viewDate: date }),

  periodType: "monthly",
  setPeriodType: (periodType) => set({ periodType }),

  normalizationMode: "pro-rated",
  setNormalizationMode: (mode) => set({ normalizationMode: mode }),
}));
