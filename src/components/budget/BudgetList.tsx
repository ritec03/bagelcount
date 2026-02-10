import { useState } from "react";
import { BudgetForm } from "./BudgetForm";
import { Plus, Calendar, Repeat, Wallet, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { normalizeBudgetAmount, filterBudgetsByMode } from '@/lib/budgetCalculations';
import { useBudgetSpentAmounts } from '@/hooks/useBudgetSpentAmounts';
import { useBudgetHierarchy } from '@/hooks/useBudgetHierarchy';
import { useBudgetListValidation } from '@/hooks/useBudgetListValidation';
import type { BudgetAllocation, PeriodType, NormalizationMode } from '@/lib/types';

interface BudgetListProps {
    budgets: BudgetAllocation[];
    isLoading: boolean;
    onBudgetChange: () => void;
    viewDate: Date;
    periodType: PeriodType;
    normalizationMode: NormalizationMode;
}

interface BudgetCardProps {
    budget: BudgetAllocation;
    spentAmount: number;
    onClick: () => void;
    periodType: PeriodType;
    normalizationMode: 'pro-rated' | 'full';
    validationError?: string | null;
    validationWarnings?: string[];
    color?: string;
}

function BudgetCard({ budget, spentAmount, onClick, periodType, normalizationMode, validationError, validationWarnings, color }: BudgetCardProps) {
    const isStandard = "frequency" in budget;
    let budgetAmount = parseFloat(budget.amount);
    
    // Apply normalization if standard budget and pro-rated mode
    if (isStandard && normalizationMode === 'pro-rated') {
        budgetAmount = normalizeBudgetAmount(budgetAmount, budget.frequency, periodType);
    }

    const percentageSpent = budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0;
    const remaining = budgetAmount - spentAmount;
    
    // Color coding: green if under budget, yellow if close, red if over
    const getProgressColor = (): string => {
        if (percentageSpent >= 100) return 'bg-red-500';
        if (percentageSpent >= 80) return 'bg-yellow-500';
        return 'bg-green-500';
    };
    
    // Parse account name for breadcrumbs
    const accountParts = budget.account.split(':');
    let displayParts = accountParts;
    
    // Remove "Expenses" prefix if present
    if (displayParts[0] === "Expenses") {
        displayParts = displayParts.slice(1);
    }
    
    const displayName = displayParts.length > 0 ? displayParts[displayParts.length - 1] : budget.account;
    let breadcrumbPath = displayParts.length > 1 ? displayParts.slice(0, -1).join(' > ') + ' >' : null;

    // Truncate breadcrumb from start if too long
    if (breadcrumbPath && breadcrumbPath.length > 30) {
        breadcrumbPath = '...' + breadcrumbPath.slice(-27);
    }

    return (
        <Card 
            onClick={onClick}
            style={{ borderLeftWidth: '6px', borderLeftColor: color || 'transparent' }}
            className={cn(
                "hover:bg-slate-50 transition-colors cursor-pointer",
                validationError && "border-red-500 bg-red-50 hover:bg-red-100",
                !validationError && validationWarnings && validationWarnings.length > 0 && "border-amber-500 bg-amber-50 hover:bg-amber-100"
            )}
        >
            <CardContent className="p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 flex-1 min-w-0">
                        <div className={cn(
                            "p-2 rounded-full flex-shrink-0",
                            isStandard ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600',
                            validationError && "bg-red-100 text-red-600",
                            !validationError && validationWarnings && validationWarnings.length > 0 && "bg-amber-100 text-amber-600"
                        )}>
                            {validationError ? <AlertCircle className="h-4 w-4" /> : 
                             (validationWarnings && validationWarnings.length > 0 ? <AlertCircle className="h-4 w-4" /> :
                             (isStandard ? <Repeat className="h-4 w-4" /> : <Calendar className="h-4 w-4" />))}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-col">
                                {breadcrumbPath && (
                                    <span className="text-xs text-muted-foreground truncate leading-none mb-0.5">
                                        {breadcrumbPath}
                                    </span>
                                )}
                                <div className="flex items-center gap-2 min-w-0">
                                    <p className="font-medium truncate leading-tight" title={budget.account}>
                                        {displayName}
                                    </p>
                                    <div className="flex-shrink-0 flex gap-1">
                                        {validationError && (
                                            <span className="text-[10px] text-red-600 font-bold px-1.5 py-0.5 rounded bg-red-100 uppercase tracking-wide">
                                                Invalid
                                            </span>
                                        )}
                                        {!validationError && validationWarnings && validationWarnings.length > 0 && (
                                            <span className="text-[10px] text-amber-600 font-bold px-1.5 py-0.5 rounded bg-amber-100 uppercase tracking-wide">
                                                Warning
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                                {budget.currency} {budgetAmount.toFixed(2)}
                                <span className="mx-2">•</span>
                                {isStandard 
                                    ? <span className="capitalize">{budget.frequency}</span>
                                    : <Badge variant="secondary" className="text-[10px] h-5 px-1.5">Project</Badge>
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

    // Filter budgets based on normalization mode using shared utility
    const filteredBudgets = filterBudgetsByMode(budgets, periodType, normalizationMode, viewDate);

    // Calculate spent amounts using custom hook
    const spentAmounts = useBudgetSpentAmounts(filteredBudgets, viewDate, periodType);

    // Pre-compute validation results for all standard budgets (memoized)
    const validationResults = useBudgetListValidation(budgets);

    // Compute hierarchy for rendering (memoized)
    const hierarchyItems = useBudgetHierarchy(filteredBudgets);

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
                    {hierarchyItems.map((item, idx) => {
                        // Skip if no budget attached (e.g. just a category node without a specific budget entry)
                        // Although our flatten logic only returns nodes with budgets, we check for safety.
                        if (!item.budget) return null;
                        
                        const budget = item.budget;

                        // Look up pre-computed validation result
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
                            <div key={idx} className="relative">
                                <BudgetCard
                                    budget={budget}
                                    spentAmount={spentAmounts.get(budget.account) || 0}
                                    onClick={() => openEdit(budget)}
                                    periodType={periodType}
                                    normalizationMode={normalizationMode}
                                    validationError={validationError}
                                    validationWarnings={validationWarnings}
                                    color={item.color}
                                />
                            </div>
                        );
                    })}
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
