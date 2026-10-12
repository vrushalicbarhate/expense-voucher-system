import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { parseError } from '../api';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import SecureImage from '../components/SecureImage.jsx';
import SignaturePicker from '../components/SignaturePicker.jsx';
import { money, dateOnly, dateTime, STATUS_LABEL } from '../format.js';

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export default function VoucherDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [v, setV] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // 'approve' | 'reject'
  const [busy, setBusy] = useState(false);

  // approve / reject form state
  const [file, setFile] = useState(null);
  const [useSaved, setUseSaved] = useState(false);
  const [reason, setReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [modalError, setModalError] = useState('');

  const load = useCallback(() => {
    return api.get(`/vouchers/${id}`).then((r) => setV(r.data)).catch((e) => setError(parseError(e).message));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const openModal = (kind) => {
    setFile(null); setReason(''); setFieldErrors({}); setModalError('');
    setUseSaved(kind === 'approve' && user.hasSavedSignature);
    setModal(kind);
  };

  const run = async (fn, successMsg) => {
    setBusy(true); setModalError('');
    try {
      await fn();
      toast(successMsg);
      setModal(null);
      await load();
    } catch (err) {
      const { message, fields } = parseError(err);
      setFieldErrors(fields); setModalError(message);
    } finally {
      setBusy(false);
    }
  };

  const submitDraft = () => run(() => api.post(`/vouchers/${id}/submit`), 'Voucher submitted for approval');

  const approve = () => {
    if (!file && !useSaved) return setFieldErrors({ signature: 'Upload your signature to approve' });
    const body = new FormData();
    if (file) body.append('signature', file);
    else body.append('useSavedSignature', 'true');
    return run(() => api.post(`/vouchers/${id}/approve`, body), 'Voucher approved');
  };

  const reject = () => {
    if (!reason.trim()) return setFieldErrors({ reason: 'Enter a reason for rejecting' });
    return run(() => api.post(`/vouchers/${id}/reject`, { reason }), 'Voucher rejected');
  };

  const remove = async () => {
    if (!window.confirm('Delete this draft? This cannot be undone.')) return;
    try {
      await api.delete(`/vouchers/${id}`);
      toast('Draft deleted');
      navigate('/vouchers/mine');
    } catch (err) {
      toast(parseError(err).message, 'error');
    }
  };

  if (error) {
    return (
      <>
        <p className="field-error" role="alert">{error}</p>
        <Link to="/" className="btn btn-quiet">Back to dashboard</Link>
      </>
    );
  }
  if (!v) return <div className="page-loading">Loading voucher…</div>;

  const isOwner = user.role === 'EMPLOYEE';
  const canDecide = user.role === 'DIRECTOR' && v.status === 'PENDING_APPROVAL';
  const backTo = isOwner ? '/vouchers/mine' : user.role === 'DIRECTOR' && v.status === 'PENDING_APPROVAL' ? '/approvals' : '/vouchers';

  return (
    <>
      <header className="page-head no-print">
        <h1>{v.voucherNumber}</h1>
        <div className="row gap wrap">
          <Link to={backTo} className="btn btn-quiet">Back to list</Link>
          {user.role !== 'EMPLOYEE' && <button className="btn btn-quiet" onClick={() => window.print()}>Print voucher</button>}
          {isOwner && v.status === 'DRAFT' && (
            <>
              <button className="btn btn-quiet danger" onClick={remove}>Delete</button>
              <Link to={`/vouchers/${v.id}/edit`} className="btn btn-quiet">Edit</Link>
              <button className="btn btn-primary" disabled={busy} onClick={submitDraft}>Submit for approval</button>
            </>
          )}
          {canDecide && (
            <>
              <button className="btn btn-quiet danger" onClick={() => openModal('reject')}>Reject</button>
              <button className="btn btn-primary" onClick={() => openModal('approve')}>Approve</button>
            </>
          )}
        </div>
      </header>

      {isOwner && v.status === 'DRAFT' && modalError && <p className="field-error" role="alert">{modalError}</p>}

      {v.status === 'REJECTED' && (
        <div className="banner banner-rejected" role="note">
          <strong>Rejected{v.director ? ` by ${v.director.name}` : ''}</strong>
          <p>{v.rejectionReason}</p>
        </div>
      )}

      <article className="voucher-paper">
        <div className="paper-head">
          <div>
            <div className="paper-kicker">Expense voucher</div>
            <h2 className="paper-number">{v.voucherNumber}</h2>
          </div>
          <div className={`stamp stamp-${v.status.toLowerCase()}`}><StatusBadge status={v.status} /></div>
        </div>

        <h3 className="paper-title">{v.title}</h3>
        <div className="paper-amount">{money(v.amount)}</div>

        <dl className="paper-grid">
          <div><dt>Employee</dt><dd>{v.employee.name}{v.employee.employeeCode ? ` (${v.employee.employeeCode})` : ''}</dd></div>
          <div><dt>Department</dt><dd>{v.department}</dd></div>
          <div><dt>Category</dt><dd>{v.category}</dd></div>
          <div><dt>Expense date</dt><dd>{dateOnly(v.expenseDate)}</dd></div>
          <div><dt>Voucher date</dt><dd>{dateOnly(v.voucherDate)}</dd></div>
          <div><dt>Submitted</dt><dd>{dateTime(v.submittedAt)}</dd></div>
          {v.status === 'APPROVED' && <div><dt>Approved on</dt><dd>{dateTime(v.approvedAt)}</dd></div>}
          {v.status === 'REJECTED' && <div><dt>Rejected on</dt><dd>{dateTime(v.rejectedAt)}</dd></div>}
          <div><dt>Created</dt><dd>{dateTime(v.createdAt)}</dd></div>
          <div><dt>Last updated</dt><dd>{dateTime(v.updatedAt)}</dd></div>
        </dl>

        <div className="paper-desc">
          <dt>Description</dt>
          <p>{v.description || 'No description provided.'}</p>
        </div>

        <div className="signatures">
          <figure>
            <div className="sig-slot">
              {v.hasEmployeeSignature ? <SecureImage path={`/vouchers/${v.id}/signature/employee`} alt={`Signature of ${v.employee.name}`} className="sig-img" /> : <span className="muted">Not signed</span>}
            </div>
            <figcaption>Employee · {v.employee.name}</figcaption>
          </figure>
          <figure>
            <div className="sig-slot">
              {v.hasDirectorSignature ? <SecureImage path={`/vouchers/${v.id}/signature/director`} alt={`Signature of ${v.director?.name}`} className="sig-img" /> : <span className="muted">{v.status === 'REJECTED' ? 'Not signed' : 'Awaiting approval'}</span>}
            </div>
            <figcaption>Director{v.director ? ` · ${v.director.name}` : ''}</figcaption>
          </figure>
        </div>
      </article>

      <section className="panel no-print">
        <h2>History</h2>
        <ol className="timeline">
          {v.history.map((h) => (
            <li key={h.id}>
              <div><strong>{STATUS_LABEL[h.toStatus]}</strong> <span className="muted">by {h.actorName}</span></div>
              {h.note && h.toStatus === 'REJECTED' && <div className="small">{h.note}</div>}
              <time className="muted small">{dateTime(h.createdAt)}</time>
            </li>
          ))}
        </ol>
      </section>

      {modal === 'approve' && (
        <Modal title="Approve voucher" onClose={() => setModal(null)}>
          <p className="muted">Your signature is required to approve {v.voucherNumber} for {money(v.amount)}.</p>
          <SignaturePicker
            label="Director signature"
            file={file}
            onChange={(f) => { setFile(f); if (f) setUseSaved(false); setFieldErrors({}); }}
            savedPath={useSaved && !file && user.hasSavedSignature ? '/users/me/signature' : null}
            error={fieldErrors.signature}
          />
          {user.hasSavedSignature && !file && (
            <label className="check">
              <input type="checkbox" checked={useSaved} onChange={(e) => { setUseSaved(e.target.checked); setFieldErrors({}); }} />
              Use my saved signature
            </label>
          )}
          {modalError && <p className="field-error" role="alert">{modalError}</p>}
          <div className="actions">
            <button className="btn btn-quiet" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy} onClick={approve}>{busy ? 'Approving…' : 'Approve voucher'}</button>
          </div>
        </Modal>
      )}

      {modal === 'reject' && (
        <Modal title="Reject voucher" onClose={() => setModal(null)}>
          <p className="muted">{v.employee.name} will see your reason and can create a new voucher.</p>
          <div className="field">
            <label htmlFor="reason">Reason for rejecting</label>
            <textarea id="reason" rows={4} maxLength={1000} value={reason} onChange={(e) => { setReason(e.target.value); setFieldErrors({}); }} autoFocus />
            {fieldErrors.reason && <p className="field-error">{fieldErrors.reason}</p>}
          </div>
          {modalError && !fieldErrors.reason && <p className="field-error" role="alert">{modalError}</p>}
          <div className="actions">
            <button className="btn btn-quiet" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-danger" disabled={busy} onClick={reject}>{busy ? 'Rejecting…' : 'Reject voucher'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
