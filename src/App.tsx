import './App.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { BudgetDashboard } from './views/BudgetDashboard'
import { TransactionsPage } from './views/TransactionsPage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 1000, // 10 seconds
    },
  },
});
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-background font-sans antialiased">
          <Routes>
            <Route path="/" element={<BudgetDashboard />} />
            <Route path="/transactions/:accountId" element={<TransactionsPage />} />
          </Routes>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
