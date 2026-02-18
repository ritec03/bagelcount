import { ChevronRight, Calendar, Repeat, AlertCircle, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { normalizeBudgetAmount } from '@/lib/budgetCalculations';
import type { BudgetAllocation, PeriodType, NormalizationMode } from '@/lib/types';

/**
 * Props for the BudgetCard component.
 */
export interface BudgetCardProps {
    /** The budget allocation data */
    budget: BudgetAllocation;
    /** Current calculated spent amount */
    spentAmount: number;
    /** Handler for clicking the card body (navigation) */
    onClick: () => void;
    /** Handler for clicking the edit button */
    onEdit: () => void;
    /** Period type (Monthly/Yearly) for display context */
    periodType: PeriodType;
    /** Normalization mode used for calculations */
    normalizationMode: NormalizationMode;
    /** Validation error message if any */
    validationError?: string | null;
    /** Validation warnings if any */
    validationWarnings?: string[];
    /** Category color strip */
    color?: string;
    /** Whether this card represents a group parent */
    isGroup?: boolean;
    /** Whether the group is currently expanded */
    isExpanded?: boolean;
    /** Handler to toggle group expansion */
    onToggle?: () => void;
}

/**
 * A comprehensive card component for displaying a single budget item.
 * 
 * Features:
 * - **Hierarchy**: Optional chevron toggle for group parents.
 * - **Status/Validation**: Visual indicators (color coding, icons) for valid/invalid states.
 * - **Progress**: Visual progress bar for spending.
 * - **Actions**: Navigation (click body) and specific Edit button.
 * - **Layout**: Flat design, intended to be stacked.
 */
export function BudgetCard({ 
    budget, 
    spentAmount, 
    onClick, 
    onEdit,
    periodType, 
    normalizationMode, 
    validationError, 
    validationWarnings, 
    color,
    isGroup,
    isExpanded,
    onToggle
}: BudgetCardProps) {
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
            style={{ borderLeftWidth: '6px', borderLeftColor: color || 'transparent' }}
            className={cn(
                "transition-colors cursor-pointer",
                validationError && "border-red-500 bg-red-50",
                !validationError && validationWarnings && validationWarnings.length > 0 && "border-amber-500 bg-amber-50"
            )}
            onClick={onClick}
        >
            <CardContent className="p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 flex-1 min-w-0">
                        <div className="flex flex-col items-center gap-2">
                            {/* Hierarchy Toggle */}
                            <div className="flex-shrink-0 min-w-[32px] flex justify-center">
                                {isGroup ? (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 rounded-full border border-slate-200 shadow-sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onToggle?.();
                                                }}
                                            >
                                                <ChevronRight className={cn(
                                                    "h-4 w-4 transition-transform duration-200 text-slate-700",
                                                    isExpanded ? "rotate-90" : ""
                                                )} />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>{isExpanded ? "Collapse" : "Expand"} child budgets</p>
                                        </TooltipContent>
                                    </Tooltip>
                                ) : (
                                    <div className="w-8" /> 
                                )}
                            </div>

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
                                {/* <span className="mx-2">•</span> */}
                                {/* {isStandard 
                                    ? <span className="capitalize">{budget.frequency}</span>
                                    : <Badge variant="secondary" className="text-[10px] h-5 px-1.5">Project</Badge>
                                } */}
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
                    
                    <div className="flex items-center gap-2 ml-4">
                        {/* Tags */}
                        {budget.tags && budget.tags.length > 0 && (
                            <div className="flex gap-2">
                                {budget.tags.map(t => (
                                    <Badge key={t} variant="outline">
                                        #{t}
                                    </Badge>
                                ))}
                            </div>
                        )}
                        
                        {/* Edit Button */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-slate-100"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onEdit();
                                    }}
                                >
                                    <Pencil className="h-4 w-4 text-muted-foreground" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Edit Budget</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
