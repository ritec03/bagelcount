import { useState } from "react";
import { BudgetList } from "../components/budget/BudgetList";
import { BudgetSunburst } from "../components/budget/BudgetSunburst";
import { BudgetPeriodControls } from "../components/budget/BudgetPeriodControls";
import { useBudgets } from "../hooks/useBudgets";
import { useTransactions } from "../hooks/useTransactions";

export function BudgetDashboard() {
    const { budgets, isLoading, refetch } = useBudgets();
    const { transactions, isLoading: isTxLoading } = useTransactions();
    
    // Budget Period State
    const [viewDate, setViewDate] = useState<Date>(new Date());
    const [periodType, setPeriodType] = useState<'monthly' | 'yearly'>('monthly');
    const [normalizationMode, setNormalizationMode] = useState<'pro-rated' | 'full'>('pro-rated');

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex flex-col space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Budget Dashboard</h1>
                <p className="text-muted-foreground">Manage your detailed zero-based budget.</p>
            </div>

            {/* Period Controls */}
            <BudgetPeriodControls 
                viewDate={viewDate}
                onDateChange={setViewDate}
                periodType={periodType}
                onPeriodChange={setPeriodType}
                normalizationMode={normalizationMode}
                onNormalizationChange={setNormalizationMode}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
                {/* Visualization Column (Dominant) */}
                <div className="lg:col-span-2 space-y-4">
                    <BudgetSunburst 
                        budgets={budgets} 
                        transactions={transactions}
                        isLoading={isLoading || isTxLoading} 
                        viewDate={viewDate}
                        periodType={periodType}
                        normalizationMode={normalizationMode}
                    />
                    {/* Placeholder for future insights or custom budget list if separated */}
                </div>

                {/* List & Edit Column */}
                <div className="lg:col-span-1">
                    <BudgetList 
                        budgets={budgets} 
                        isLoading={isLoading} 
                        onBudgetChange={refetch}
                        viewDate={viewDate}
                        periodType={periodType}
                        normalizationMode={normalizationMode}
                    />
                </div>
            </div>
        </div>
    );
}
