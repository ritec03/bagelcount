import { useState } from "react";
import { useBudgetSpentAmounts } from "../../hooks/useBudgetSpentAmounts";
import { BudgetForm } from "./BudgetForm";
import type { BudgetAllocation } from "../../lib/types";
import { Plus, Calendar, Repeat, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface BudgetListProps {
    budgets: BudgetAllocation[];
    isLoading: boolean;
    onBudgetChange: () => void;
}

interface BudgetCardProps {
    budget: BudgetAllocation;
    spentAmount: number;
    onClick: () => void;
}

function BudgetCard({ budget, spentAmount, onClick }: BudgetCardProps) {
    const isStandard = "frequency" in budget;
    const budgetAmount = parseFloat(budget.amount as string);
    const percentageSpent = budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0;
    const remaining = budgetAmount - spentAmount;
    
    // Color coding: green if under budget, yellow if close, red if over
    const getProgressColor = (): string => {
        if (percentageSpent >= 100) return 'bg-red-500';
        if (percentageSpent >= 80) return 'bg-yellow-500';
        return 'bg-green-500';
    };
    
    return (
        <Card 
            onClick={onClick}
            className="hover:bg-slate-50 transition-colors cursor-pointer"
        >
            <CardContent className="p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 flex-1">
                        <div className={cn(
                            "p-2 rounded-full",
                            isStandard ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'
                        )}>
                            {isStandard ? <Repeat className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
                        </div>
                        <div className="flex-1">
                            <p className="font-medium">{budget.account}</p>
                            <p className="text-sm text-muted-foreground">
                                {budget.currency} {budgetAmount.toFixed(2)}
                                <span className="mx-2">•</span>
                                {isStandard 
                                    ? <span className="capitalize">{budget.frequency}</span>
                                    : <Badge variant="secondary">Project</Badge>
                                }
                            </p>
                            {/* Progress Bar */}
                            <div className="mt-2 w-full">
                                <div className="flex justify-between text-xs text-gray-600 mb-1">
                                    <span>${spentAmount.toFixed(2)} spent</span>
                                    <span>${remaining.toFixed(2)} remaining</span>
                                </div>
                                <Progress 
                                    value={Math.min(percentageSpent, 100)} 
                                    className="h-2"
                                    indicatorClassName={getProgressColor()}
                                />
                            </div>
                        </div>
                    </div>
                    
                    {/* Tags */}
                    {budget.tags && budget.tags.length > 0 && (
                        <div className="flex gap-2 ml-4">
                            {budget.tags.map(t => (
                                <Badge key={t} variant="outline">
                                    #{t}
                                </Badge>
                            ))}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
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

export function BudgetList({ budgets, isLoading, onBudgetChange }: BudgetListProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingBudget, setEditingBudget] = useState<BudgetAllocation | null>(null);

    // Calculate spent amounts using custom hook
    const spentAmounts = useBudgetSpentAmounts(budgets);

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
            ) : budgets.length === 0 ? (
                <EmptyState />
            ) : (
                <div className="grid gap-4">
                    {budgets.map((budget, idx) => (
                        <BudgetCard
                            key={idx}
                            budget={budget}
                            spentAmount={spentAmounts.get(budget.account) || 0}
                            onClick={() => openEdit(budget)}
                        />
                    ))}
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
