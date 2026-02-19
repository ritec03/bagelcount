/**
 * This file defines public facade interface for operations with budgets,
 * including adding, deleting, updating, modifying a budget.
 * Operations either are blocked or allowed to proceed, and
 * in either case, the returned budgets may contains warnings
 * explaining violated constraints.
 */

import type { StandardBudgetOutput } from "../types";
import type { ConstraintConfig, ConstraintViolationMap } from "./constraints";

// ==========================================
// Data Structures
// ==========================================

export interface ExtendedBudget extends StandardBudgetOutput {
  id: string; // Ensure ID is present on output
  /**
   * Active warnings for this specific budget. 
   * Useful for highlighting the specific row in a UI table.
   */
  warnings: ConstraintViolationMap; 
}

export interface OperationSuccess {
  success: true;
  /** * A map of ALL budgets that changed state due to this operation.
   * This allows the UI to update the modified budget AND its parent/children
   * in one go without reloading the whole list.
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
   * Returns active budgets for a view, fully calculated.
   */
  getBudgetList(range: { start: Date; end: Date }): ExtendedBudget[];

  /**
   * Adds a new budget.
   * Note: Takes 'Input' (no ID), returns Result containing the new 'Extended' budget.
   */
  addBudget(budget: StandardBudgetOutput): OperationResult;

  /**
   * Updates an existing budget.
   */
  updateBudget(id: string, budget: Partial<StandardBudgetOutput>): OperationResult;

  /**
   * Removes a budget.
   * Result.updates will likely contain the *parent* budget (recalculated totals).
   */
  removeBudget(id: string): OperationResult;
}
