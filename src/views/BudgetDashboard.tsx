
import { BudgetList } from "../components/budget/BudgetList";
import { BudgetSunburst } from "../components/budget/BudgetSunburst";
import { useBudgets } from "../hooks/useBudgets";
import { useTransactions } from "../hooks/useTransactions";

export function BudgetDashboard() {
    const { budgets, isLoading, refetch } = useBudgets();
    const { transactions, isLoading: isTxLoading } = useTransactions();

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex flex-col space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Budget Dashboard</h1>
                <p className="text-muted-foreground">Manage your detailed zero-based budget.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
                {/* Visualization Column (Dominant) */}
                <div className="lg:col-span-2 space-y-4">
                    <BudgetSunburst 
                        budgets={budgets} 
                        transactions={transactions}
                        isLoading={isLoading || isTxLoading} 
                    />
                    {/* Placeholder for future insights or custom budget list if separated */}
                </div>

                {/* List & Edit Column */}
                <div className="lg:col-span-1">
                    <BudgetList 
                        budgets={budgets} 
                        isLoading={isLoading} 
                        onBudgetChange={refetch}
                    />
                </div>
            </div>
        </div>
    );
}
