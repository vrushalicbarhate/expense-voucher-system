import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const NAV = {
  EMPLOYEE: [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/vouchers/new', label: 'Create voucher' },
    { to: '/vouchers/mine', label: 'My vouchers' },
  ],
  DIRECTOR: [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/approvals', label: 'Pending approvals' },
    { to: '/vouchers', label: 'All vouchers' },
  ],
  ACCOUNTS: [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/vouchers', label: 'All vouchers' },
  ],
};

const ROLE_LABEL = { EMPLOYEE: 'Employee', DIRECTOR: 'Director', ACCOUNTS: 'Accounts team' };

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Expense vouchers</div>
        <nav className="nav" aria-label="Main">
          {NAV[user.role].map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="whoami">
          <div className="whoami-name">{user.name}</div>
          <div className="muted small">{ROLE_LABEL[user.role]}</div>
          <button className="btn btn-quiet" onClick={() => { logout(); navigate('/login'); }}>Log out</button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
