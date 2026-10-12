import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import VoucherForm from './pages/VoucherForm.jsx';
import VoucherList from './pages/VoucherList.jsx';
import VoucherDetail from './pages/VoucherDetail.jsx';

const EMPLOYEE = ['EMPLOYEE'];
const DIRECTOR = ['DIRECTOR'];
const REVIEWERS = ['DIRECTOR', 'ACCOUNTS'];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />

        <Route path="vouchers/new" element={<ProtectedRoute roles={EMPLOYEE}><VoucherForm /></ProtectedRoute>} />
        <Route path="vouchers/mine" element={<ProtectedRoute roles={EMPLOYEE}><VoucherList mode="mine" /></ProtectedRoute>} />
        <Route path="vouchers/:id/edit" element={<ProtectedRoute roles={EMPLOYEE}><VoucherForm /></ProtectedRoute>} />

        <Route path="approvals" element={<ProtectedRoute roles={DIRECTOR}><VoucherList mode="pending" /></ProtectedRoute>} />
        <Route path="vouchers" element={<ProtectedRoute roles={REVIEWERS}><VoucherList mode="all" /></ProtectedRoute>} />

        <Route path="vouchers/:id" element={<VoucherDetail />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
