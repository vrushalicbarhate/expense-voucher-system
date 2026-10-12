import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { parseError } from '../api';
import { useAuth } from '../auth.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Pagination from '../components/Pagination.jsx';
import { money, dateOnly, STATUS_LABEL } from '../format.js';

const TITLES = { mine: 'My vouchers', pending: 'Pending approvals', all: 'All vouchers' };
const EMPTY = { q: '', status: '', department: '', category: '', employeeName: '', dateFrom: '', dateTo: '', minAmount: '', maxAmount: '' };

const COLUMNS = [
  { key: 'voucherNumber', label: 'Voucher' },
  { key: 'employeeName', label: 'Employee', reviewerOnly: true },
  { key: 'department', label: 'Department' },
  { key: 'expenseDate', label: 'Expense date' },
  { key: 'amount', label: 'Amount', numeric: true },
  { key: 'status', label: 'Status' },
];

export default function VoucherList({ mode }) {
  const { user } = useAuth();
  const isEmployee = user.role === 'EMPLOYEE';
  const [filters, setFilters] = useState(EMPTY);
  const [debounced, setDebounced] = useState(EMPTY);
  const [sort, setSort] = useState({ sortBy: 'updatedAt', order: 'desc' });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState({ categories: [], statuses: [], departments: [] });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    api.get('/meta').then((r) => setMeta(r.data)).catch(() => {});
  }, []);

  // Wait for the person to stop typing before hitting the API.
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(filters); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [filters]);

  useEffect(() => { setFilters(EMPTY); setPage(1); }, [mode]);

  const params = useMemo(() => {
    const p = { ...sort, page, limit: 10 };
    Object.entries(debounced).forEach(([k, v]) => { if (v !== '') p[k] = v; });
    if (mode === 'pending') p.status = 'PENDING_APPROVAL';
    return p;
  }, [debounced, sort, page, mode]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get('/vouchers', { params })
      .then((r) => { if (!cancelled) { setResult(r.data); setError(''); } })
      .catch((e) => { if (!cancelled) setError(parseError(e).message); })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [params]);

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const toggleSort = (key) =>
    setSort((s) => (s.sortBy === key ? { sortBy: key, order: s.order === 'asc' ? 'desc' : 'asc' } : { sortBy: key, order: 'asc' }));
  const activeCount = Object.entries(filters).filter(([k, v]) => v !== '' && k !== 'q').length;
  const columns = COLUMNS.filter((c) => !c.reviewerOnly || !isEmployee);

  return (
    <>
      <header className="page-head">
        <h1>{TITLES[mode]}</h1>
        {mode === 'mine' && <Link to="/vouchers/new" className="btn btn-primary">Create voucher</Link>}
      </header>

      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder={isEmployee ? 'Search by voucher number or title' : 'Search by voucher number, title or employee'}
          value={filters.q}
          onChange={set('q')}
          aria-label="Search vouchers"
        />
        <button className="btn btn-quiet" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
          Filters{activeCount ? ` (${activeCount})` : ''}
        </button>
      </div>

      {showFilters && (
        <div className="filters">
          {mode !== 'pending' && (
            <div className="field">
              <label htmlFor="f-status">Status</label>
              <select id="f-status" value={filters.status} onChange={set('status')}>
                <option value="">Any status</option>
                {meta.statuses.filter((s) => !(s === 'DRAFT' && !isEmployee)).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
          )}
          {!isEmployee && (
            <div className="field">
              <label htmlFor="f-emp">Employee name</label>
              <input id="f-emp" value={filters.employeeName} onChange={set('employeeName')} />
            </div>
          )}
          <div className="field">
            <label htmlFor="f-dept">Department</label>
            <input id="f-dept" list="dept-list" value={filters.department} onChange={set('department')} />
            <datalist id="dept-list">{meta.departments.map((d) => <option key={d} value={d} />)}</datalist>
          </div>
          <div className="field">
            <label htmlFor="f-cat">Category</label>
            <select id="f-cat" value={filters.category} onChange={set('category')}>
              <option value="">Any category</option>
              {meta.categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-from">Expense date from</label>
            <input id="f-from" type="date" value={filters.dateFrom} onChange={set('dateFrom')} />
          </div>
          <div className="field">
            <label htmlFor="f-to">Expense date to</label>
            <input id="f-to" type="date" value={filters.dateTo} onChange={set('dateTo')} />
          </div>
          <div className="field">
            <label htmlFor="f-min">Minimum amount</label>
            <input id="f-min" type="number" min="0" value={filters.minAmount} onChange={set('minAmount')} />
          </div>
          <div className="field">
            <label htmlFor="f-max">Maximum amount</label>
            <input id="f-max" type="number" min="0" value={filters.maxAmount} onChange={set('maxAmount')} />
          </div>
          <div className="field end">
            <button className="btn btn-quiet" onClick={() => setFilters(EMPTY)}>Clear filters</button>
          </div>
        </div>
      )}

      {error && <p className="field-error" role="alert">{error}</p>}

      <div className="table-wrap" aria-busy={loading}>
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.numeric ? 'num' : ''} aria-sort={sort.sortBy === c.key ? (sort.order === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button className="th-btn" onClick={() => toggleSort(c.key)}>
                    {c.label}
                    <span aria-hidden="true">{sort.sortBy === c.key ? (sort.order === 'asc' ? ' ▲' : ' ▼') : ''}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result?.data.map((v) => (
              <tr key={v.id}>
                <td>
                  <Link to={`/vouchers/${v.id}`} className="strong">{v.voucherNumber}</Link>
                  <div className="muted small">{v.title}</div>
                </td>
                {!isEmployee && <td>{v.employee.name}</td>}
                <td>{v.department}</td>
                <td>{dateOnly(v.expenseDate)}</td>
                <td className="num">{money(v.amount)}</td>
                <td><StatusBadge status={v.status} /></td>
              </tr>
            ))}
            {result && result.data.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="empty">
                  {activeCount || filters.q
                    ? 'No vouchers match these filters. Try clearing some.'
                    : mode === 'pending'
                    ? 'Nothing is waiting for your approval.'
                    : mode === 'mine'
                    ? 'You have no vouchers yet. Create your first one.'
                    : 'No vouchers have been submitted yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {result && (
        <div className="list-foot">
          <span className="muted small">
            {result.meta.total} voucher{result.meta.total === 1 ? '' : 's'} · {money(result.meta.totalAmount)} in total
          </span>
          <Pagination meta={result.meta} onPage={setPage} />
        </div>
      )}
    </>
  );
}
