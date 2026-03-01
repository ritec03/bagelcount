import { useQuery } from '@tanstack/react-query';
import { getAccountsApiV1AccountsGet as getAccounts } from '../lib/api/sdk.gen';
import type { Account } from '../lib/api/types.gen';

export function useAccounts() {
    const { data: accounts = [], isLoading, error, refetch } = useQuery<Account[], Error>({
        queryKey: ['accounts'],
        queryFn: async () => {
            const { data } = await getAccounts();
            return data ?? [];
        }
    });

    return { 
        accounts, 
        isLoading, 
        error, 
        refetch 
    };
}
