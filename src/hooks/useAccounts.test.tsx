import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAccounts } from './useAccounts';
import { getAccountsApiV1AccountsGet } from '../lib/api/sdk.gen';
import type { Account } from '../lib/api/types.gen';
import React from 'react';

// Mock the generated API client
vi.mock('../lib/api/sdk.gen', () => ({
    getAccountsApiV1AccountsGet: vi.fn(),
}));

const mockGetAccounts = vi.mocked(getAccountsApiV1AccountsGet);

// Create a wrapper with QueryClientProvider
const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false, // Disable retries for faster tests
            },
        },
    });
    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
};

describe('useAccounts', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('(Z) Zero: should return empty array when API returns empty list', async () => {
        // Arrange
        mockGetAccounts.mockResolvedValueOnce({ data: [], error: undefined, request: {} as Request, response: {} as Response });
        
        // Act
        const { result } = renderHook(() => useAccounts(), { wrapper: createWrapper() });
        
        // Assert
        expect(result.current.isLoading).toBe(true);
        
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        expect(result.current.accounts).toEqual([]);
        expect(result.current.error).toBeNull();
    });

    it('(M) Many: should return populated array when API returns accounts', async () => {
        // Arrange
        const mockAccounts: Account[] = [
            { name: 'Checking', type: 'asset' },
            { name: 'Savings', type: 'asset' },
        ];
        mockGetAccounts.mockResolvedValueOnce({ data: mockAccounts, error: undefined, request: {} as Request, response: {} as Response });
        
        // Act
        const { result } = renderHook(() => useAccounts(), { wrapper: createWrapper() });
        
        // Assert
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        expect(result.current.accounts).toEqual(mockAccounts);
        expect(result.current.error).toBeNull();
    });

    it('(E) Exceptions: should handle API errors gracefully', async () => {
        // Arrange
        const testError = new Error('Network error');
        mockGetAccounts.mockRejectedValueOnce(testError);
        
        // Act
        const { result } = renderHook(() => useAccounts(), { wrapper: createWrapper() });
        
        // Assert
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        expect(result.current.accounts).toEqual([]);
        expect(result.current.error).toBeTruthy();
        expect(result.current.error?.message).toBe('Network error');
    });
});
