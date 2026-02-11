
import { useEffect, useState } from 'react';
import { getBudgetsApiV1BudgetsGet as getBudgets } from '../lib/api/sdk.gen';
import type { BudgetAllocation } from '../lib/types';

export function useBudgets(filters: {   
    date?: string; 
    startDate?: string;
    endDate?: string; 
} = {}) {
    // Basic Fetch Hook (since we are not using React Query yet)
    const [budgets, setBudgets] = useState<BudgetAllocation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchBudgets = async () => {
        setIsLoading(true);
        try {
            // Mapping string dates to API expected params
            // Generated SDK expects "date" as string "YYYY-MM-DD" usually
            const { data } = await getBudgets({
                query: {
                    date: filters.date,
                    start_date: filters.startDate,
                    end_date: filters.endDate
                }
            });
            
            if (data) {
                setBudgets(data);
            }
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Unknown error fetching budgets'));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchBudgets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.date, filters.startDate, filters.endDate]);

    return { 
        budgets, 
        isLoading, 
        error, 
        refetch: fetchBudgets 
    };
}
