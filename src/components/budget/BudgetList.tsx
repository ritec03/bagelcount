
import { useState } from "react";
import { useBudgets } from "../../hooks/useBudgets";
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
    // In real app, filters would be passed here
    
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingBudget, setEditingBudget] = useState<BudgetAllocation | null>(null);

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

            {isLoading && <div className="text-sm text-gray-500">Loading budgets...</div>}
            
            <div className="grid gap-4">
                {(Array.isArray(budgets) ? budgets : []).map((b, idx) => {
                    const isStandard = "frequency" in b;
                    return (
                        <div 
                            key={idx} 
                            onClick={() => {
                                setEditingBudget(b);
                                setIsDialogOpen(true);
                            }}
                            className="flex items-center justify-between p-4 border rounded-lg bg-card shadow-sm hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                            <div className="flex items-center space-x-4">
                                <div className={`p-2 rounded-full ${isStandard ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                                    {isStandard ? <Repeat className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
                                </div>
                                <div>
                                    <p className="font-medium">{b.account}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {b.currency} {parseFloat(b.amount as string).toFixed(2)}
                                        <span className="mx-2">•</span>
                                        {isStandard 
                                            ? <span className="capitalize">{(b as any).frequency}</span> 
                                            : <span className="text-xs bg-slate-200 px-1 rounded">Project</span>
                                        }
                                    </p>
                                </div>
                            </div>
                            
                            {/* Tags */}
                            <div className="flex gap-2">
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
