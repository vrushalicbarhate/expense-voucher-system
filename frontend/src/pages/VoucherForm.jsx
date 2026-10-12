import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { parseError } from '../api';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import SignaturePicker from '../components/SignaturePicker.jsx';
import { todayISO } from '../format.js';

export default function VoucherForm() {
  const { id } = useParams();
  const editing = !!id;
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({
    department: user.department || '',
    title: '',
    expenseDate: todayISO(),
    category: '',
    description: '',
    amount: '',
  });
  const [file, setFile] = useState(null);
  const [existingSignature, setExistingSignature] = useState(null);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(editing);
  const [meta, setMeta] = useState({ categories: [], departments: [] });

  useEffect(() => {
    api.get('/meta').then((r) => setMeta(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!editing) return;
    api.get(`/vouchers/${id}`)
      .then(({ data: v }) => {
        if (v.status !== 'DRAFT') return navigate(`/vouchers/${id}`, { replace: true });
        setForm({
          department: v.department, title: v.title, expenseDate: v.expenseDate,
          category: v.category, description: v.description || '', amount: String(v.amount),
        });
        if (v.hasEmployeeSignature) setExistingSignature(`/vouchers/${id}/signature/employee`);
      })
      .catch((e) => setFormError(parseError(e).message))
      .finally(() => setLoading(false));
  }, [editing, id, navigate]);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const hasSignature = !!(file || existingSignature || user.hasSavedSignature);

  // Mirrors the server rules so people get instant feedback; the server still enforces them.
  const validate = (forSubmit) => {
    const e = {};
    if (!form.department.trim()) e.department = 'Department is required';
    if (!form.title.trim()) e.title = 'Expense title is required';
    if (!form.expenseDate) e.expenseDate = 'Expense date is required';
    else if (form.expenseDate > todayISO()) e.expenseDate = 'Expense date cannot be in the future';
    if (!form.category) e.category = 'Choose a category';
    if (form.amount === '') e.amount = 'Amount is required';
    else if (!(Number(form.amount) > 0)) e.amount = 'Amount must be greater than zero';
    if (forSubmit && !hasSignature) e.signature = 'Upload your signature before submitting';
    return e;
  };

  const save = async (submit) => {
    setFormError('');
    const e = validate(submit);
    setErrors(e);
    if (Object.keys(e).length) return;

    setBusy(submit ? 'submit' : 'draft');
    try {
      const body = new FormData();
      Object.entries(form).forEach(([k, v]) => body.append(k, v));
      if (file) body.append('signature', file);

      const { data: saved } = editing ? await api.put(`/vouchers/${id}`, body) : await api.post('/vouchers', body);

      if (file && saveAsDefault) {
        const sig = new FormData();
        sig.append('signature', file);
        await api.post('/users/me/signature', sig);
        await refresh();
      }
      if (submit) await api.post(`/vouchers/${saved.id}/submit`);

      toast(submit ? `${saved.voucherNumber} submitted for approval` : `${saved.voucherNumber} saved as draft`);
      navigate(`/vouchers/${saved.id}`);
    } catch (err) {
      const { message, fields } = parseError(err);
      setErrors(fields);
      setFormError(message);
    } finally {
      setBusy('');
    }
  };

  if (loading) return <div className="page-loading">Loading voucher…</div>;

  return (
    <>
      <header className="page-head">
        <h1>{editing ? 'Edit draft voucher' : 'Create voucher'}</h1>
        <Link to={editing ? `/vouchers/${id}` : '/vouchers/mine'} className="btn btn-quiet">Cancel</Link>
      </header>

      <form className="panel form-grid" onSubmit={(e) => e.preventDefault()} noValidate>
        <div className="field">
          <label htmlFor="department">Department</label>
          <input id="department" list="departments" value={form.department} onChange={set('department')} aria-invalid={!!errors.department} />
          <datalist id="departments">{meta.departments.map((d) => <option key={d} value={d} />)}</datalist>
          {errors.department && <p className="field-error">{errors.department}</p>}
        </div>

        <div className="field">
          <label htmlFor="category">Expense category</label>
          <select id="category" value={form.category} onChange={set('category')} aria-invalid={!!errors.category}>
            <option value="">Choose a category</option>
            {meta.categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          {errors.category && <p className="field-error">{errors.category}</p>}
        </div>

        <div className="field span-2">
          <label htmlFor="title">Expense title</label>
          <input id="title" value={form.title} maxLength={150} onChange={set('title')} aria-invalid={!!errors.title} placeholder="For example: Taxi to client office" />
          {errors.title && <p className="field-error">{errors.title}</p>}
        </div>

        <div className="field">
          <label htmlFor="expenseDate">Expense date</label>
          <input id="expenseDate" type="date" max={todayISO()} value={form.expenseDate} onChange={set('expenseDate')} aria-invalid={!!errors.expenseDate} />
          {errors.expenseDate && <p className="field-error">{errors.expenseDate}</p>}
        </div>

        <div className="field">
          <label htmlFor="amount">Amount (INR)</label>
          <input id="amount" type="number" inputMode="decimal" step="0.01" min="0" value={form.amount} onChange={set('amount')} aria-invalid={!!errors.amount} />
          {errors.amount && <p className="field-error">{errors.amount}</p>}
        </div>

        <div className="field span-2">
          <label htmlFor="description">Description <span className="muted">(optional)</span></label>
          <textarea id="description" rows={4} maxLength={2000} value={form.description} onChange={set('description')} placeholder="What was this expense for?" />
        </div>

        <div className="span-2">
          <SignaturePicker
            label="Your signature"
            file={file}
            onChange={setFile}
            existingPath={existingSignature}
            savedPath={user.hasSavedSignature ? '/users/me/signature' : null}
            error={errors.signature}
          />
          {file && (
            <label className="check">
              <input type="checkbox" checked={saveAsDefault} onChange={(e) => setSaveAsDefault(e.target.checked)} />
              Save as my default signature for future vouchers
            </label>
          )}
        </div>

        {formError && <p className="field-error span-2" role="alert">{formError}</p>}

        <div className="actions span-2">
          <button className="btn btn-quiet" disabled={!!busy} onClick={() => save(false)}>
            {busy === 'draft' ? 'Saving…' : 'Save as draft'}
          </button>
          <button className="btn btn-primary" disabled={!!busy} onClick={() => save(true)}>
            {busy === 'submit' ? 'Submitting…' : 'Submit for approval'}
          </button>
        </div>
      </form>
    </>
  );
}
