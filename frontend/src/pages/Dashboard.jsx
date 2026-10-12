import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { parseError } from '../api';
import { useAuth } from '../auth.jsx';
import { money, dateTime, STATUS_LABEL } from '../format.js';

function Stat({ label, value, tone, to }) {
  const body = (
    <>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </>
  );
  return to ? <Link to={to} className={`stat ${tone || ''}`}>{body}</Link> : <div className={`stat ${tone || ''}`}>{body}</div>;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard').then((r) => setData(r.data.stats)).catch((e) => setError(parseError(e).message));
  }, []);

  if (error) return <p className="field-error">{error}</p>;
  if (!data) return <div className="page-loading">Loading dashboard…</div>;

  return (
    <>
      <header className="page-head">
        <h1>Hello, {user.name.split(' ')[0]}</h1>
        {user.role === 'EMPLOYEE' && <Link to="/vouchers/new" className="btn btn-primary">Create voucher</Link>}
        {user.role === 'DIRECTOR' && <Link to="/approvals" className="btn btn-primary">Review pending</Link>}
      </header>

      {user.role === 'EMPLOYEE' && (
        <div className="stats">
          <Stat label="Total vouchers" value={data.totalVouchers} to="/vouchers/mine" />
          <Stat label="Drafts" value={data.draftVouchers} />
          <Stat label="Pending approval" value={data.pendingApproval} tone="pending" />
          <Stat label="Approved" value={data.approvedVouchers} tone="approved" />
          <Stat label="Rejected" value={data.rejectedVouchers} tone="rejected" />
          <Stat label="Total amount claimed" value={money(data.totalAmountClaimed)} />
        </div>
      )}

      {user.role === 'DIRECTOR' && (
        <>
          <div className="stats">
            <Stat label="Pending approval" value={data.pendingApprovalCount} tone="pending" to="/approvals" />
            <Stat label="Approved today" value={data.approvedToday} tone="approved" />
            <Stat label="Rejected today" value={data.rejectedToday} tone="rejected" />
            <Stat label="Total pending amount" value={money(data.totalPendingAmount)} />
          </div>
          <section className="panel">
            <h2>Recent voucher activity</h2>
            {data.recentActivity.length === 0 ? (
              <p className="muted">No voucher activity yet.</p>
            ) : (
              <ul className="activity">
                {data.recentActivity.map((a) => (
                  <li key={a.id}>
                    <Link to={`/vouchers/${a.voucherId}`}>{a.voucherNumber}</Link>
                    <span>{a.title} · {a.employeeName} · {money(a.amount)}</span>
                    <span className={`badge badge-${a.status.toLowerCase()}`}>{STATUS_LABEL[a.status]}</span>
                    <time className="muted small">{dateTime(a.at)}</time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {user.role === 'ACCOUNTS' && (
        <>
          <div className="stats">
            <Stat label="Total vouchers" value={data.totalVouchers} to="/vouchers" />
            <Stat label="Pending approval" value={data.pendingApproval} tone="pending" />
            <Stat label="Approved" value={data.approvedVouchers} tone="approved" />
            <Stat label="Rejected" value={data.rejectedVouchers} tone="rejected" />
            <Stat label="Total approved amount" value={money(data.totalApprovedAmount)} />
          </div>
          <section className="panel">
            <h2>Recently approved</h2>
            {data.recentApproved.length === 0 ? (
              <p className="muted">Approved vouchers will appear here, ready for reimbursement.</p>
            ) : (
              <ul className="activity">
                {data.recentApproved.map((v) => (
                  <li key={v.id}>
                    <Link to={`/vouchers/${v.id}`}>{v.voucherNumber}</Link>
                    <span>{v.title} · {v.employeeName}</span>
                    <strong>{money(v.amount)}</strong>
                    <time className="muted small">{dateTime(v.approvedAt)}</time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
