import { createBudgetFacade } from '@/lib/budgets/service/budgetManager';
import { createContext } from 'react';

const facade = createBudgetFacade()
export const BudgetManagerContext = createContext(facade);
