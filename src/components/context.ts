import { createBudgetFacade } from '@/lib/budgets/service/budgetManager';
import type { ConstraintConfig } from '../lib/budgets/constraints/constraints';
import { createContext } from 'react';

const facade = createBudgetFacade()
export const BudgetManagerContext = createContext(facade);

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
const CONSTRAINT_CONFIG: ConstraintConfig = {
  ParentChildrenSum: {
    parent: 'warning',
    child_same_freq: 'blocking',
    child_lower_freq: 'warning',
    child_higher_freq: 'blocking',
  },
};

export const ConstraintConfigContext = createContext(CONSTRAINT_CONFIG);