/**
 * This file defines public facade interface for operations with budgets,
 * including adding, deleting, updating, modifying a budget.
 * Operations either are blocked or allowed to proceed, and
 * in either case, the returned budgets may contains warnings
 * explaining violated constraints.
 */

import type { PeriodType, StandardBudgetOutput } from "../../models/types";
import type { ConstraintConfig, ConstraintViolationMap } from "../constraints/constraints";
import { NaiveDate } from "../../utils/dateUtil";

// ==========================================
// Data Structures
// ==========================================

export interface ExtendedBudget extends StandardBudgetOutput {
  id: string;
  /**
   * Active warnings for this specific budget.
   */
  warnings: ConstraintViolationMap; 
}

export interface OperationSuccess {
  success: true;
  /** A map of ALL budgets that changed state due to this operation.
   */
  updates: Record<string, ExtendedBudget>; 
}

export interface OperationFailure {
  success: false;
  /**
   * The specific violations that triggered the 'blocking' config
   * and caused the operation to be rejected.
   */
  errors: ConstraintViolationMap;
  
  /**
   * Any other non-blocking violations that were detected during the check.
   * (Useful so the user can fix everything at once).
   */
  warnings: ConstraintViolationMap;
}

export type OperationResult = OperationSuccess | OperationFailure;

// ==========================================
// The Facade
// ==========================================

export interface BudgetFacade {
  subscribe(listener: () => void): () => void;
  getBudgetsSnapshot: () => ExtendedBudget[];

  /**
   * Purely for initialization.
   * Performs validation as specified in constraint config.
   * In this case "blocking" constraints do not block anything as blocking
   * only relate to changing the budgets (add/update/delete) and here just
   * generate warnings.
   * Converts raw data into "Extended" objects with warnings calculated.
   */
  initializeBudgets(rawBudgets: StandardBudgetOutput[], config: ConstraintConfig): ExtendedBudget[];

  /**
   * Filter budgets based on the current period type (or 'custom'), and view date.
   * 
   * Logic:
   * - 'custom': Returns only Custom Budgets (Project budgets) that overlap with the view date.
   * - 'monthly'/'yearly': Returns only Standard Budgets with matching frequency that are active on the view date.
   * 
   * @param periodTypeOrCustom - The active view mode: 'monthly', 'yearly', or 'custom'
   * @param date - The reference date for overlap checks
   */
  getActiveBudgets(periodTypeOrCustom: PeriodType | 'custom', date: NaiveDate, dummyBudgetInput: ExtendedBudget[]): ExtendedBudget[];

  /**
   * Normalizes a budget amount based on its frequency to the target period length.
   * e.g. yearly amount 1200 to monthly period = 100.
   */
  normalizeAmount(amount: number, frequency: PeriodType, targetPeriod: PeriodType): number;

  /**
   * Returns active budgets for a view, fully calculated.
   */
  getBudgetList(range: { start: Date; end: Date }): ExtendedBudget[];

  /**
   * Adds a new budget.
   * Returns Result containing the new 'Extended' budget.
   */
  addBudget(budget: StandardBudgetOutput): OperationResult;

  /**
   * Validates a candidate budget against the current tree state without
   * committing any changes.  Useful for real-time form feedback.
   *
   * Semantics are identical to `addBudget` but the internal state is never
   * mutated — the caller is free to call this on every keystroke.
   */
  previewAddBudget(budget: StandardBudgetOutput): OperationResult;

  /**
   * Validates an update to an existing budget against the current tree state
   * without committing any changes. Useful for real-time form editing feedback.
   */
  previewUpdateBudget(id: string, budget: Partial<StandardBudgetOutput> & Pick<StandardBudgetOutput, "id">): OperationResult;

  /**
   * Updates an existing budget.
   */
  updateBudget(id: string, budget: Partial<StandardBudgetOutput> & Pick<StandardBudgetOutput, "id">): OperationResult;

  /**
   * Removes a budget.
   * Result.updates will likely contain the *parent* budget (recalculated totals).
   */
  removeBudget(id: string): OperationResult;
}
