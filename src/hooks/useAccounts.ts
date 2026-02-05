import { useEffect, useState } from 'react';
import { getAccountsApiV1AccountsGet as getAccounts } from '../lib/api/sdk.gen';
import type { Account } from '../lib/api/types.gen';

export function useAccounts() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchAccounts = async () => {
        setIsLoading(true);
        try {
            const { data } = await getAccounts();
            
            if (data) {
                setAccounts(data);
            }
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Unknown error fetching accounts'));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchAccounts();
    }, []);

    return { 
        accounts, 
        isLoading, 
        error, 
        refetch: fetchAccounts 
    };
}
