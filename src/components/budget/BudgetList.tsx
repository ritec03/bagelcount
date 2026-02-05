
import { useState } from "react";
import { useBudgets } from "../../hooks/useBudgets";
import { useTransactions } from "../../hooks/useTransactions";
import { BudgetForm } from "./BudgetForm";
import type { BudgetAllocation } from "../../lib/types";
import { Plus, Edit2, Calendar, Repeat } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog"; 
// Using Radix primitives directly to mimic shadcn behavior without full component bloat for now
// In real app, import { Dialog, DialogContent, ... } from "@/components/ui/dialog"

interface BudgetListProps {
    budgets: BudgetAllocation[];
    isLoading: boolean;
    onBudgetChange: () => void;
}

export function BudgetList({ budgets, isLoading, onBudgetChange }: BudgetListProps) {
    const { transactions, isLoading: isTxLoading } = useTransactions();
    
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingBudget, setEditingBudget] = useState<BudgetAllocation | null>(null);

    // Calculate spent amount for a given account
    const getSpentForAccount = (accountName: string): number => {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth(); // 0-indexed

        return transactions.reduce((total, tx) => {
            const txDate = new Date(tx.date);
            if (txDate.getFullYear() !== currentYear || txDate.getMonth() !== currentMonth) {
                return total;
            }

            if (!tx.postings) return total;

            // Match account or sub-account logic
            const relevantPosting = tx.postings.find(p => 
                p.account === accountName || p.account.startsWith(accountName + ":")
            );
            
            if (relevantPosting) {
                const amountStr = relevantPosting.units.split(' ')[0];
                const amount = parseFloat(amountStr);
                return total + (isNaN(amount) ? 0 : amount);
            }
            
            return total;
        }, 0);
    };

    const handleSuccess = () => {
        setIsDialogOpen(false);
        setEditingBudget(null);
        onBudgetChange();
    };

    const openCreate = () => {
        setEditingBudget(null);
        setIsDialogOpen(true);
    };

    // Note: Edit logic would require pre-filling the form.
    // Our BudgetForm setup mainly for Create currently.
    // For V1, let's focus on "Add Budget" and listing. 
    // Editing would need the form to accept `defaultValues`.
    
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight">Active Budgets</h2>
                <button 
                    onClick={openCreate}
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2 bg-black text-white"
                >
                    <Plus className="mr-2 h-4 w-4" /> Add Budget
                </button>
            </div>

            {(isLoading || isTxLoading) && <div className="text-sm text-gray-500">Loading budgets...</div>}
            
            <div className="grid gap-4">
                {(Array.isArray(budgets) ? budgets : []).map((b, idx) => {
                    const isStandard = "frequency" in b;
                    const budgetAmount = parseFloat(b.amount as string);
                    const spentAmount = getSpentForAccount(b.account);
                    const percentageSpent = budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0;
                    const remaining = budgetAmount - spentAmount;
                    
                    // Color coding: green if under budget, yellow if close, red if over
                    const getProgressColor = () => {
                        if (percentageSpent >= 100) return 'bg-red-500';
                        if (percentageSpent >= 80) return 'bg-yellow-500';
                        return 'bg-green-500';
                    };
                    
                    return (
                        <div 
                            key={idx} 
                            onClick={() => {
                                setEditingBudget(b);
                                setIsDialogOpen(true);
                            }}
                            className="flex items-center justify-between p-4 border rounded-lg bg-card shadow-sm hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                            <div className="flex items-center space-x-4 flex-1">
                                <div className={`p-2 rounded-full ${isStandard ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                                    {isStandard ? <Repeat className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
                                </div>
                                <div className="flex-1">
                                    <p className="font-medium">{b.account}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {b.currency} {budgetAmount.toFixed(2)}
                                        <span className="mx-2">•</span>
                                        {isStandard 
                                            ? <span className="capitalize">{(b as any).frequency}</span> 
                                            : <span className="text-xs bg-slate-200 px-1 rounded">Project</span>
                                        }
                                    </p>
                                    {/* Progress Bar */}
                                    <div className="mt-2 w-full">
                                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                                            <span>${spentAmount.toFixed(2)} spent</span>
                                            <span>${remaining.toFixed(2)} remaining</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                            <div 
                                                className={`h-full transition-all duration-300 ${getProgressColor()}`}
                                                style={{ width: `${Math.min(percentageSpent, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Tags */}
                            <div className="flex gap-2 ml-4">
                                {b.tags?.map(t => (
                                    <span key={t} className="text-xs bg-slate-100 border px-2 py-0.5 rounded-full text-slate-600">
                                        #{t}
                                    </span>
                                ))}
                            </div>
                        </div>
                    );
                })}
                
                {budgets.length === 0 && !isLoading && (
                    <div className="text-center py-10 text-gray-500 border-dashed border-2 rounded-lg">
                        No active budgets found.
                    </div>
                )}
            </div>

            {/* Radix Dialog for Modal behavior */}
            <Dialog.Root open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                    <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg bg-white">
                        <Dialog.Title className="sr-only">
                            {editingBudget ? "Edit Budget" : "Create Budget"}
                        </Dialog.Title>
                        <BudgetForm 
                            onSuccess={handleSuccess} 
                            initialData={editingBudget as any} // Cast roughly to submission type (compatible shapes mostly)
                        />
                        <Dialog.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                             <span className="sr-only">Close</span>
                        </Dialog.Close>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </div>
    );
}
