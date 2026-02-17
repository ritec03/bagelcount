import './App.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { BudgetDashboard } from './views/BudgetDashboard'
import { TransactionsPage } from './views/TransactionsPage'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background font-sans antialiased">
        <Routes>
          <Route path="/" element={<BudgetDashboard />} />
          <Route path="/transactions/:accountId" element={<TransactionsPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
