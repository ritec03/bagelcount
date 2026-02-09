import { useCallback } from 'react';
import { ResponsiveSunburst } from '@nivo/sunburst';
import { useBudgetSunburstData } from '../../hooks/useBudgetSunburstData';
import type { BudgetAllocation } from '../../lib/types';
import type { Transaction } from '../../lib/api/types.gen';
import type { SunburstNode } from '../../hooks/types/sunburst';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// ============================================================================
// Sub-Components
// ============================================================================

interface BudgetTooltipProps {
  node: SunburstNode;
}

function BudgetTooltip({ node }: BudgetTooltipProps) {
  // No tooltip for spacer nodes
  if (node.type === 'spacer') return null;
  
  // Type-safe handling based on discriminated union
  const budget = node.type === 'budget' ? node.budgeted : node.totalBudget;
  const spent = node.type === 'budget' ? node.spent : node.totalSpent;
  const remaining = budget - spent;
  
  return (
    <div className="bg-popover text-popover-foreground shadow-md border rounded-md p-2 text-xs">
      <div className="flex items-center gap-2 mb-1">
        <div 
          className="w-3 h-3 rounded-full" 
          style={{ backgroundColor: node.color }}
        />
        <strong>{node.name}</strong>
      </div>
      <div>Budget: ${budget.toFixed(2)}</div>
      <div>Spent: ${spent.toFixed(2)}</div>
      <div>Remaining: ${remaining.toFixed(2)}</div>
    </div>
  );
}

// ============================================================================
// Main Component (Fully Presentational)
// ============================================================================

interface BudgetSunburstProps {
  budgets: BudgetAllocation[];
  transactions: Transaction[];
  isLoading?: boolean;
}

export function BudgetSunburst({ 
  budgets, 
  transactions,
  isLoading: externalLoading = false 
}: BudgetSunburstProps) {
  // Use the hook to get processed data
  const { data, isLoading: dataLoading } = useBudgetSunburstData(budgets, transactions);

  const isLoading = externalLoading || dataLoading;

  // Count actual budgets for empty state
  const hasBudgets = budgets?.some(b => 'frequency' in b) ?? false;

  // ============================================================================
  // Memoized Handlers (Performance: Prevent Nivo re-renders)
  // ============================================================================

  const getBorderColor = useCallback((node: { data: SunburstNode }) => {
    return node.data.type === 'spacer' ? 'transparent' : 'white';
  }, []);

  const getColors = useCallback((node: { data: SunburstNode }) => {
    return node.data.color || '#e5e7eb';
  }, []);

  const getArcLabel = useCallback((d: { data: SunburstNode }) => {
    const node = d.data;
    if (node.type === 'spacer') return '';
    
    // Show budgeted amount for budget nodes, totalBudget for categories
    const amount = node.type === 'budget' ? node.budgeted : node.totalBudget;
    return `$${amount.toFixed(0)}`;
  }, []);

  const renderTooltip = useCallback(({ data: nodeData }: { data: SunburstNode }) => {
    return <BudgetTooltip node={nodeData} />;
  }, []);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <Card className="h-[500px] w-full flex flex-col">
      <CardHeader>
        <CardTitle>Distribution</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0">
        {isLoading ? (
          <Skeleton className="h-full w-full rounded-xl" />
        ) : !hasBudgets ? (
          <div className="flex items-center justify-center h-full text-muted-foreground border-dashed border-2 rounded">
            No Recurring Budgets to visualize
          </div>
        ) : (
          <div className="h-full w-full">
            <ResponsiveSunburst
              data={data}
              margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
              id="name"
              value="value"
              cornerRadius={2}
              borderColor={getBorderColor}
              borderWidth={1}
              
              inheritColorFromParent={false}
              colors={getColors}
              
              enableArcLabels={true}
              arcLabelsSkipAngle={10}
              arcLabel={getArcLabel}
              arcLabelsTextColor={{
                from: 'color',
                modifiers: [['darker', 2]]
              }}
              
              tooltip={renderTooltip}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
