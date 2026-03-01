import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BudgetForm } from "./BudgetForm";
import { BudgetCard } from "./BudgetCard";
import { CollapsedPlaceholder } from "./CollapsedPlaceholder";
import { useBudgetList } from "../../hooks/useBudgetList";
import type { BudgetAllocation, PeriodType } from '@/lib/models/types';
import { useBudgetQuery } from "../../hooks/useBudgetQuery";
import { formatViolationWarnings } from "../../lib/budgets/constraints/constraintMessages";
import { useAppStore, type AppState } from "@/hooks/store";
// import { useContext } from 'react';

// The "Beancount Safe" Approach
function getPeriodDates(viewDate: Date, periodType: PeriodType): {startDate: string, endDate: string} {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    // Helper to force YYYY-MM-DD string creation from local numbers
    const toBeancountString = (y: number, m: number, d: number) => {
        return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    };

    if (periodType === 'monthly') {
        // Last day of month trick: Day 0 of next month
        const lastDay = new Date(year, month + 1, 0).getDate();
        
        return { 
            startDate: toBeancountString(year, month, 1), 
            endDate: toBeancountString(year, month, lastDay) 
        };
    } else if (periodType === 'quarterly') {
        throw Error("Not Implemented")
    } else {
        return { 
            startDate: toBeancountString(year, 0, 1), 
            endDate: toBeancountString(year, 11, 31) 
        };
    }
}

function BudgetListSkeleton() {
    return (
        <div className="space-y-4">
            {[1, 2, 3].map((i) => (
                <Card key={i}>
                    <CardContent className="p-4">
                        <div className="flex items-center space-x-4">
                            <Skeleton className="h-10 w-10 rounded-full" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-3 w-48" />
                                <Skeleton className="h-2 w-full mt-2" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

function EmptyState() {
    return (
        <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                <Wallet className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No active budgets found.</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                    Get started by creating your first budget.
                </p>
            </CardContent>
        </Card>
    );
}

export function BudgetList() {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingBudget, setEditingBudget] = useState<BudgetAllocation | null>(null);
    const navigate = useNavigate();

    const allBudgets = useAppStore((state: AppState) => state.budgetList)
    const viewDate = useAppStore((state: AppState) => state.viewDate)
    const periodType = useAppStore((state: AppState) => state.periodType)

    const { isLoading } = useBudgetQuery();

    // Use custom hook for logic
    const { 
        filteredBudgets, 
        renderItems, 
        spentAmounts,
        collapsedIds,
        toggleCollapse
    } = useBudgetList(
      allBudgets,
    );
    console.groupEnd();


    const openCreate = () => {
        setEditingBudget(null);
        setIsDialogOpen(true);
    };

    const openEdit = (budget: BudgetAllocation) => {
        setEditingBudget(budget);
        setIsDialogOpen(true);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight">Active Budgets</h2>
                <Button onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" /> Add Budget
                </Button>
            </div>

            {isLoading ? (
                <BudgetListSkeleton />
            ) : filteredBudgets.length === 0 ? (
                <EmptyState />
            ) : (
                <div className="grid gap-4">
                    <TooltipProvider>
                    {renderItems.map((entry, idx) => {
                        if (entry.type === 'placeholder') {
                            return (
                                <CollapsedPlaceholder 
                                    key={`placeholder-${entry.path}`}
                                    count={entry.count}
                                    onClick={() => toggleCollapse(entry.path)} 
                                />
                            );
                        }

                        const item = entry.item;
                        if (!item.budget) return null;

                        const budget = item.budget;
                        const isExpanded = !collapsedIds.has(item.fullPath);
                        
                        //  TOOD validationError not used anymore
                        const validationError = null;
                        let validationWarnings: string[] = [];


                        // TODO add back warning/invalid distinction late if necessary
                        if (allBudgets && "id" in budget) {
                            const facadeBudget = allBudgets.find(fb => fb.id === budget.id);
                            if (facadeBudget) {
                                const facadeWarnings = formatViolationWarnings(facadeBudget.warnings);
                                validationWarnings = [...validationWarnings, ...facadeWarnings];
                            }
                        }

                        return (
                            <div key={idx} className="relative z-10">
                                <BudgetCard
                                    budget={budget}
                                    spentAmount={spentAmounts.get(budget.account) || 0}
                                    onClick={() => {
                                        const { startDate, endDate } = getPeriodDates(viewDate, periodType);
                                        navigate(`/transactions/${budget.account}?startDate=${startDate}&endDate=${endDate}`);
                                    }}
                                    onEdit={() => openEdit(budget)}
                                    validationError={validationError}
                                    validationWarnings={validationWarnings}
                                    color={item.color}
                                    isGroup={item.isGroup}
                                    isExpanded={isExpanded}
                                    onToggle={() => toggleCollapse(item.fullPath)}
                                    />
                            </div>
                        );
                    })}
                    </TooltipProvider>
                </div>
            )}

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>
                            {editingBudget ? "Edit Budget" : "Create Budget"}
                        </DialogTitle>
                    </DialogHeader>
                    <BudgetForm 
                        initialData={editingBudget}
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
}
