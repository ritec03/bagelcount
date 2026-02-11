import { useState } from "react";
import { filterBudgetsByMode } from '@/lib/budgetCalculations';
import { useBudgetSpentAmounts } from '@/hooks/useBudgetSpentAmounts';
import { useBudgetHierarchy } from '@/hooks/useBudgetHierarchy';
import { useBudgetListValidation } from '@/hooks/useBudgetListValidation';
import type { BudgetAllocation, PeriodType, NormalizationMode } from '@/lib/types';

/**
 * Custom hook to manage the logic for the BudgetList component.
 * 
 * Handles:
 * - Filtering budgets based on normalization mode and period.
 * - Calculating spent amounts and validation results.
 * - Managing hierarchy and collapse state.
 * - Flattening the hierarchy into a renderable list with "Placeholder" items for collapsed groups.
 * 
 * @param budgets - List of all budget allocations.
 * @param viewDate - Current view date.
 * @param periodType - Period type (monthly/yearly).
 * @param normalizationMode - Mode for standardizing budget amounts.
 * @returns Object containing filtered data, render items, validation results, and handlers.
 */
export function useBudgetList(
    budgets: BudgetAllocation[],
    viewDate: Date,
    periodType: PeriodType,
    normalizationMode: NormalizationMode
) {
    // State for collapsed groups (using fullPath)
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

    const toggleCollapse = (path: string) => {
        const newCollapsed = new Set(collapsedIds);
        if (newCollapsed.has(path)) {
            newCollapsed.delete(path);
        } else {
            newCollapsed.add(path);
        }
        setCollapsedIds(newCollapsed);
    };

    // Filter budgets based on normalization mode using shared utility
    const filteredBudgets = filterBudgetsByMode(budgets, periodType, normalizationMode, viewDate);

    // Calculate spent amounts using custom hook
    const spentAmounts = useBudgetSpentAmounts(filteredBudgets, viewDate, periodType);

    // Pre-compute validation results for all standard budgets (memoized)
    const validationResults = useBudgetListValidation(budgets);

    // Compute hierarchy
    const hierarchyItems = useBudgetHierarchy(filteredBudgets);

    // Calculate render items with placeholders
    const renderItems: ({ type: 'budget', item: typeof hierarchyItems[0] } | { type: 'placeholder', path: string, count: number })[] = [];
    
    // Stack to track active collapsed groups: { path, level, count }
    const collapsedStack: { path: string, level: number, count: number }[] = [];

    // Optimize loop: add a dummy item at the end to force flush
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemsToProcess = [...hierarchyItems, { fullPath: '___END___', path: '', level: -1, isGroup: false, name: '', depth: 0, budget: null } as any];

    /**
     * Stack-based iteration to build the flat render list.
     * Functions:
     * 1. Detects when a collapsed group ends (by checking path prefix).
     * 2. Inserts a "Placeholder" item when a group ends if it was collapsed.
     * 3. Counts hidden immediate children for the placeholder.
     * 4. Skips rendering of hidden items.
     */
    for (const item of itemsToProcess) {
        // 1. Flush completed groups based on current item
        while (collapsedStack.length > 0) {
            const top = collapsedStack[collapsedStack.length - 1];
            // If item is NOT a descendant of top, we are done with top
            if (!item.fullPath.startsWith(top.path + ":")) {
                if (top.count > 0) {
                     renderItems.push({ type: 'placeholder', path: top.path, count: top.count });
                }
                collapsedStack.pop();
            } else {
                // It is a descendant, so we are still inside the group
                break;
            }
        }

        // 2. If item is the dummy, stop
        if (item.fullPath === '___END___') break;

        // 3. If currently hidden (inside a collapsed group)
        if (collapsedStack.length > 0) {
            const top = collapsedStack[collapsedStack.length - 1];
            // Check if immediate child (level difference of 1)
            // Assuming levels are 0, 1, 2... and strictly increment for children
            if (item.level === top.level + 1) {
                top.count++;
            }
            continue; // Skip rendering
        }

        // 4. Render visible item
        if (item.budget) {
            renderItems.push({ type: 'budget', item });
        }

        // 5. If this visible item is a collapsed group, start tracking
        if (item.isGroup && collapsedIds.has(item.fullPath)) {
            collapsedStack.push({ path: item.fullPath, level: item.level, count: 0 });
        }
    }

    return {
        filteredBudgets,
        renderItems,
        validationResults,
        spentAmounts,
        collapsedIds,
        toggleCollapse
    };
}
