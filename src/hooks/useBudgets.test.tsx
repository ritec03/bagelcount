import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getBudgetsApiV1BudgetsGet } from '../lib/api/sdk.gen';
import type { StandardBudgetOutput } from '../lib/api/types.gen';
import React from 'react';
import { useBudgetQueryBasic } from './useBudgetQuery';

// Mock the generated API client
vi.mock('../lib/api/sdk.gen', () => ({
    getBudgetsApiV1BudgetsGet: vi.fn(),
}));

const mockGetBudgets = vi.mocked(getBudgetsApiV1BudgetsGet);

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

describe('useBudgets', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('(Z) Zero: should return empty array when API returns empty list', async () => {
        // Arrange
        mockGetBudgets.mockResolvedValueOnce({ data: [], error: undefined, request: {} as Request, response: {} as Response });
        
        // Act
        const { result } = renderHook(() => useBudgetQueryBasic(), { wrapper: createWrapper() });
        
        // Assert
        expect(result.current.isLoading).toBe(true);
        
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        expect(result.current.data).toEqual([]);
        expect(result.current.error).toBeNull();
    });

    it('(M) Many: should return populated array when API returns budgets', async () => {
        // Arrange
        const mockBudgets: StandardBudgetOutput[] = [
            { id: '1', account: 'Groceries', amount: '500', start_date: '2024-01-01', created_at: 1704067200, frequency: 'monthly', end_date: null },
            { id: '2', account: 'Entertainment', amount: '200', start_date: '2024-01-01', created_at: 1704067200, frequency: 'monthly', end_date: null },
        ];
        mockGetBudgets.mockResolvedValueOnce({ data: mockBudgets, error: undefined, request: {} as Request, response: {} as Response });
        
        // Act
        const { result } = renderHook(() => useBudgetQueryBasic(), { wrapper: createWrapper() });
        
        // Assert
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        expect(result.current.data).toEqual(mockBudgets);
        expect(result.current.error).toBeNull();
    });

    it('(E) Exceptions: should handle API errors gracefully', async () => {
        // Arrange
        const testError = new Error('Network error');
        mockGetBudgets.mockRejectedValueOnce(testError);
        
        // Act
        const { result } = renderHook(() => useBudgetQueryBasic(), { wrapper: createWrapper() });
        
        // Assert
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        expect(result.current.data).toBeUndefined();
        expect(result.current.error).toBeInstanceOf(Error);
        expect(result.current.error?.message).toBe('Network error');
    });

    it('(I) Interface: should pass correct filters to API', async () => {
        // Arrange
        mockGetBudgets.mockResolvedValueOnce({ data: [], error: undefined, request: {} as Request, response: {} as Response });
        const filters = {
            date: '2024-01-15',
            startDate: '2024-01-01',
            endDate: '2024-01-31'
        };
        
        // Act
        renderHook(() => useBudgetQueryBasic(filters), { wrapper: createWrapper() });
        
        // Assert
        await waitFor(() => {
            expect(mockGetBudgets).toHaveBeenCalledWith({
                query: {
                    date: '2024-01-15',
                    start_date: '2024-01-01',
                    end_date: '2024-01-31'
                }
            });
        });
    });
});
