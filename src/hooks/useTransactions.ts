
import { useEffect, useState } from 'react';
import { getTransactionsApiV1TransactionsGet as getTransactions } from '../lib/api/sdk.gen';
import type { Transaction } from '../lib/api/types.gen';

export function useTransactions(filters: {   
    fromDate?: string; 
    toDate?: string;
} = {}) {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchTransactions = async () => {
        setIsLoading(true);
        try {
            const { data } = await getTransactions({
                query: {
                    from_date: filters.fromDate,
                    to_date: filters.toDate
                }
            });
            
            if (data) {
                setTransactions(data);
            }
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Unknown error fetching transactions'));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTransactions();
    }, [filters.fromDate, filters.toDate]);

    return { 
        transactions, 
        isLoading, 
        error, 
        refetch: fetchTransactions 
    };
}
