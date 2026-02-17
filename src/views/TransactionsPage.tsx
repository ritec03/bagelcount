import { useEffect, useState, useMemo } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { ArrowLeft, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTable } from "@/components/ui/data-table"
import { columns } from "./transactions/columns"
import type { TransactionRow } from "./transactions/columns"
import type { Transaction } from "@/lib/api/types.gen"
import { getTransactionsApiV1TransactionsGet } from "@/lib/api/sdk.gen"

// Real API call
async function fetchTransactions(accountId: string, startDate?: string, endDate?: string): Promise<Transaction[]> {
    try {
        const response = await getTransactionsApiV1TransactionsGet({ 
            query: { 
                account: accountId,
                from_date: startDate || undefined,
                to_date: endDate || undefined
            } 
        });
        return response.data || [];
    } catch (error) {
        console.error("API Error fetching transactions:", error);
        return [];
    }
}

export function TransactionsPage() {
    const { accountId } = useParams<{ accountId: string }>()
    const navigate = useNavigate()
    const [data, setData] = useState<TransactionRow[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")

    const [searchParams] = useSearchParams();
    const [startDate, setStartDate] = useState(searchParams.get("startDate") || "")
    const [endDate, setEndDate] = useState(searchParams.get("endDate") || "")

    useEffect(() => {
        if (!accountId) return;

        const loadData = async () => {
            setIsLoading(true);
            try {
                // Determine the actual account name from ID if needed, 
                // but here accountId is likely the account name passed in URL
                const decodedAccount = decodeURIComponent(accountId);
                
                const transactions = await fetchTransactions(decodedAccount);
                
                // Transform to Row type
                const rows: TransactionRow[] = transactions.map(t => {
                    // Find posting for this account or its sub-accounts
                    // Should theoretically handle decoded URI component logic if needed
                    const posting = t.postings?.find(p => 
                        p.account === decodedAccount || 
                        p.account === accountId ||
                        p.account.startsWith(decodedAccount + ":") ||
                        p.account.startsWith(accountId + ":")
                    );
                    
                    return {
                        ...t,
                        displayAmount: posting ? parseFloat(posting.units) : 0,
                        displayCurrency: posting ? posting.currency : "CAD"
                    };
                });
                
                setData(rows);
            } catch (err) {
                console.error("Failed to fetch transactions", err);
            } finally {
                setIsLoading(false);
            }
        };

        loadData();
    }, [accountId]); // We can add startDate/endDate here if we switch to server-side filtering later

    const filteredData = useMemo(() => {
        let result = data;

        // Text search
        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            result = result.filter(row => 
                (row.payee?.toLowerCase().includes(lowerTerm)) || 
                (row.narration?.toLowerCase().includes(lowerTerm))
            );
        }

        // Date range filter (Client Side for now)
        if (startDate) {
            result = result.filter(row => row.date >= startDate);
        }
        if (endDate) {
            result = result.filter(row => row.date <= endDate);
        }

        return result;
    }, [data, searchTerm, startDate, endDate]);

    if (!accountId) return <div>Invalid Account</div>

    return (
        <div className="container mx-auto py-10 space-y-6">
            <div className="flex items-center space-x-4">
                <Button variant="outline" size="icon" onClick={() => navigate("/")}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-3xl font-bold tracking-tight">
                    Transactions: <span className="text-primary">{decodeURIComponent(accountId)}</span>
                </h1>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div className="flex items-center space-x-2 w-full max-w-sm">
                    <Input 
                        placeholder="Search transactions..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="max-w-sm"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground whitespace-nowrap">From:</span>
                        <Input 
                            type="date" 
                            value={startDate} 
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-auto"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground whitespace-nowrap">To:</span>
                        <Input 
                            type="date" 
                            value={endDate} 
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-auto"
                        />
                    </div>
                    {(startDate || endDate) && (
                        <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                                setStartDate("");
                                setEndDate("");
                            }}
                        >
                            Reset
                        </Button>
                    )}
                </div>
            </div>

            {isLoading ? (
                 <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <DataTable columns={columns} data={filteredData} />
            )}
        </div>
    )
}
