import { useQuery } from '@tanstack/react-query';
import { getTransactionsApiV1TransactionsGet as getTransactions } from '../lib/api/sdk.gen';
import type { Transaction } from '../lib/api/types.gen';

export function useTransactions(filters: {
  fromDate?: string;
  toDate?: string;
} = {}) {
  const { data: transactions = [], isLoading, error, refetch } = useQuery<Transaction[], Error>({
    queryKey: ['transactions', filters.fromDate, filters.toDate],
    queryFn: async () => {
      const { data } = await getTransactions({
        query: {
          from_date: filters.fromDate,
          to_date: filters.toDate,
        },
      });
      return data ?? [];
    },
  });

  return {
    transactions,
    isLoading,
    error,
    refetch,
  };
}
