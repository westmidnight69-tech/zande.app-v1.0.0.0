import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Invoices from './pages/Invoices';
import Clients from './pages/Clients';
import Accounts from './pages/Accounts';
import Expenses from './pages/Expenses';
import Payments from './pages/Payments';
import BankAccounts from './pages/BankAccounts';
import Documents from './pages/Documents';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Reconciliation from './pages/Reconciliation';

import { AuthProvider } from './components/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';
import Signup from './pages/Signup';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          
          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="clients" element={<Clients />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="expenses" element={<Expenses />} />
              <Route path="payments" element={<Payments />} />
              <Route path="bank" element={<BankAccounts />} />
              <Route path="documents" element={<Documents />} />
              <Route path="reports" element={<Reports />} />
              <Route path="settings" element={<Settings />} />
              <Route path="reconciliation" element={<Reconciliation />} />
              <Route path="more" element={<div className="p-4">More (Coming Soon)</div>} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
