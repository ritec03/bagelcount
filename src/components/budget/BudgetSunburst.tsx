
import { ResponsiveSunburst } from "@nivo/sunburst";
import { useBudgets } from "../../hooks/useBudgets";
import type { BudgetAllocation, StandardBudgetOutput } from "../../lib/types";
import { Loader2 } from "lucide-react";
import { useTransactions } from "../../hooks/useTransactions";
import type { Transaction } from "../../lib/api/types.gen";

// --- Types ---
interface ChartData {
    name: string;
    loc?: number; // Value size
    color?: string;
    children?: ChartData[];
    // Custom metadata
    spent?: number;
    budgeted?: number;
    value?: number;
    type?: string;
}

interface BudgetSunburstProps {
    budgets: BudgetAllocation[];
    isLoading: boolean;
}

export function BudgetSunburst({ budgets, isLoading: isBudgetsLoading }: BudgetSunburstProps) {
    const { transactions, isLoading: isTxLoading } = useTransactions();
    
    // Safety check for budgets being undefined initially
    const safeBudgets = budgets || [];
    
    if (isBudgetsLoading || isTxLoading) {
        return <div className="h-[400px] flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
    }

    // --- Helper: Calculate Spent per Account ---
    const getSpentForAccount = (accountName: string, frequency: string, startDateStr: string) => {
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
            const relevantPosting = tx.postings.find(p => p.account === accountName || p.account.startsWith(accountName + ":"));
            
            if (relevantPosting) {
                 const amountStr = relevantPosting.units.split(' ')[0];
                 const amount = parseFloat(amountStr);
                 return total + (isNaN(amount) ? 0 : amount);
            }
            
            return total;
        }, 0);
    };

    // --- Data Transformation Logic ---
    const standardBudgets = safeBudgets.filter((b): b is StandardBudgetOutput => 
        "frequency" in b
    );

    // Color Palette
    const PALETTE = [
        "#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f", "#e5c494", "#b3b3b3"
    ];
    let colorIdx = 0;

    const root: ChartData = {
        name: "Budget",
        children: []
    };

    // New Data Structure Logic: Map-based first, then Tree
    // We need to support "Implicit Remainder"
    // 1. Build Node Map
    const nodeMap = new Map<string, ChartData>();
    
    // Helper to get or create node
    const getOrCreateNode = (pathParts: string[], parent: ChartData): ChartData => {
        if (pathParts.length === 0) return parent;
        
        const head = pathParts[0];
        const tail = pathParts.slice(1);
        
        // Find child in parent
        let child = parent.children?.find(c => c.name === head);
        if (!child) {
            const isTopLevel = parent.name === "Budget";
            child = { 
                name: head, 
                children: [],
                color: isTopLevel ? "#cbd5e1" : undefined // Group neutral color
            };
            if (!parent.children) parent.children = [];
            parent.children.push(child);
            nodeMap.set(head, child); // Warning: Names might clash if not full path. 
            // Ideally we map by Full Path but for V1 visual construction let's stick to pointer reference traversal
        }
        
        return getOrCreateNode(tail, child);
    };

    // 1. Register all explicit budgets into the tree
    // We attach the 'budgetMeta' to the node so we know it has an explicit budget
    standardBudgets.forEach(b => {
        const parts = b.account.split(":");
        const node = getOrCreateNode(parts, root);
        // Tag it with explicit budget info
        node.budgeted = parseFloat(b.amount as string);
        (node as any)._meta = b;
        (node as any)._fullPath = b.account;
        
    });

    // 2. Assign Colors to Categories (Level 1 items usually)
    if (root.children) {
        root.children.forEach(group => {
             if (group.children) {
                 group.children.forEach(category => {
                     // Assign distinct palette color to "Food", "Rent"
                     if (!category.color) {
                        category.color = PALETTE[colorIdx++ % PALETTE.length];
                     }
                 })
             }
        });
    }

    // Helper: Hierarchy match spending
    const getSpentHierarchical = (accountName: string, startDateStr?: string) => { // frequency/date simplified for V1
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        return transactions.reduce((total, tx) => {
            const txDate = new Date(tx.date);
            // Simple Monthly Filter
            if (txDate.getFullYear() !== currentYear || txDate.getMonth() !== currentMonth) return total;
            if (!tx.postings) return total;
            
            // StartsWith or Exact match
            const relevantPosting = tx.postings.find(p => p.account === accountName || p.account.startsWith(accountName + ":"));
            
            if (relevantPosting) {
                 const amountStr = relevantPosting.units.split(' ')[0];
                 const amount = parseFloat(amountStr);
                 return total + (isNaN(amount) ? 0 : amount);
            }
            return total;
        }, 0);
    };

    // 3. Process Logic: "Remainder" nodes
    const processNode = (node: ChartData) => {
        // If this node has explicit budget
        if (node.budgeted !== undefined && (node as any)._meta) {
            const fullAccount = (node as any)._fullPath;
            
            // 1. Calculate Budget Logic
            const budgetChildren = node.children?.filter(c => c.budgeted !== undefined) || [];
            
            // Recurse FIRST to populate children stats
            budgetChildren.forEach(processNode);

            const childrenBudgetSum = budgetChildren.reduce((sum, c) => sum + (c.budgeted || 0), 0);
            
            // Remainder Budget = ThisBudget - ChildrenBudgets
            const remainderBudget = Math.max(0, node.budgeted - childrenBudgetSum);
            
            // 2. Spending Calculations
            const totalHierarchySpent = getSpentHierarchical(fullAccount);
            
            // Spending that belongs to specific budgeted children 
            const childrenHierarchySpent = budgetChildren.reduce((sum, c) => {
                 return sum + getSpentHierarchical((c as any)._fullPath);
            }, 0);
            
            const remainderSpent = Math.max(0, totalHierarchySpent - childrenHierarchySpent);
            
            // Data Enrichment for Gradient Generation
            node.spent = totalHierarchySpent;
            
            // Rebuild Children: [Specific Children..., Unallocated]
            const newChildren = [...budgetChildren];
            
            if (remainderBudget > 0) {
                 // Sizing node for the unallocated portion
                 // User wants "Empty Space".
                 newChildren.push({
                     name: `${node.name} Unallocated`,
                     value: remainderBudget, 
                     color: 'transparent', // INVISIBLE
                     // Metadata so we don't try to give it a gradient
                     type: 'spacer'
                 } as any);
            }
            
            node.children = newChildren;
            
        } else {
             // Non-budgeted grouping node
             if (node.children) {
                 node.children.forEach(processNode);
             }
        }
    };
    
    // Run processing
    root.children?.forEach(processNode);

    // Make root transparent
    root.color = 'rgba(255, 255, 255, 0)'; 

    // POST-PROCESSING: Propagate Colors
    const propagateColors = (node: ChartData, parentColor?: string) => {
        if (!node.color && parentColor) {
            node.color = parentColor;
        }
        if (node.children) {
            node.children.forEach(child => propagateColors(child, node.color));
        }
    };
    propagateColors(root);

    return (
        <div className="h-[500px] w-full border rounded-xl bg-card shadow-sm p-4 relative">
            <h3 className="absolute top-4 left-6 text-lg font-semibold z-10">Distribution</h3>
            
            {standardBudgets.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground border-dashed border-2 rounded">
                    No Recurring Budgets to visualize
                </div>
            ) : (
                <div className="h-full w-full">
                    <ResponsiveSunburst
                        data={root}
                        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                        id="name"
                        value="value" 
                        cornerRadius={2}
                        borderColor={(node: any) => node.data.type === 'spacer' ? 'transparent' : 'white'}
                        borderWidth={1}
                        
                        inheritColorFromParent={false}
                        colors={(node: any) => node.data.color || '#e5e7eb'}
                        
                        enableArcLabels={true}
                        arcLabelsSkipAngle={10}
                        arcLabel={(d) => {
                            if (d.data.type === 'spacer') return '';
                            // @ts-ignore
                            return `$${(d.data.budgeted || d.value).toFixed(0)}`;
                        }}
                        arcLabelsTextColor={{
                            from: 'color',
                            modifiers: [['darker', 2]]
                        }}
                        
                        tooltip={({ id, value, color, data }) => {
                            if (data.type === 'spacer') return null;
                            const budget = (data as any).budgeted || value;
                            const spent = (data as any).spent || 0;
                            const remaining = budget - spent;
                            
                            return (
                                <div className="p-2 bg-white border shadow-lg rounded text-xs text-black">
                                     <div className="flex items-center gap-2 mb-1">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }}></div>
                                        <strong>{data.name}</strong>
                                    </div>
                                    <div>Budget: ${budget.toFixed(2)}</div>
                                    <div>Spent: ${spent.toFixed(2)}</div>
                                    <div>Remaining: ${remaining.toFixed(2)}</div>
                                </div>
                            );
                        }}
                    />

                </div>
            )}
        </div>
    );
}
