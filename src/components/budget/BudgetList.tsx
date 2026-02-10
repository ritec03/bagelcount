import { useState } from "react";
import { Plus, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BudgetForm } from "./BudgetForm";
import { BudgetCard } from "./BudgetCard";
import { CollapsedPlaceholder } from "./CollapsedPlaceholder";
import { useBudgetList } from "./useBudgetList";
import type { BudgetAllocation, PeriodType, NormalizationMode } from '@/lib/types';

interface BudgetListProps {
    budgets: BudgetAllocation[];
    isLoading: boolean;
    onBudgetChange: () => void;
    viewDate: Date;
    periodType: PeriodType;
    normalizationMode: NormalizationMode;
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

export function BudgetList({ 
    budgets, 
    isLoading, 
    onBudgetChange,
    viewDate,
    periodType,
    normalizationMode
}: BudgetListProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingBudget, setEditingBudget] = useState<BudgetAllocation | null>(null);

    // Use custom hook for logic
    const { 
        filteredBudgets, 
        renderItems, 
        validationResults, 
        spentAmounts,
        collapsedIds,
        toggleCollapse 
    } = useBudgetList(budgets, viewDate, periodType, normalizationMode);

    const handleSuccess = () => {
        setIsDialogOpen(false);
        setEditingBudget(null);
        onBudgetChange();
    };

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
                        
                        let validationError = null;
                        let validationWarnings: string[] = [];
                        
                        if ("frequency" in budget) {
                            const key = `${budget.account}:${budget.frequency}`;
                            const result = validationResults.get(key);
                            if (result) {
                                validationError = result.error;
                                validationWarnings = result.warnings;
                            }
                        }

                        return (
                            <div key={idx} className="relative z-10">
                                <BudgetCard
                                    budget={budget}
                                    spentAmount={spentAmounts.get(budget.account) || 0}
                                    onClick={() => openEdit(budget)}
                                    periodType={periodType}
                                    normalizationMode={normalizationMode}
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
                        onSuccess={handleSuccess} 
                        initialData={editingBudget}
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
}

