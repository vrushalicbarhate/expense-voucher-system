const db = require('../db');
const { ROLES } = require('../constants');

async function employee(user) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status='DRAFT')::int AS draft,
            COUNT(*) FILTER (WHERE status='PENDING_APPROVAL')::int AS pending,
            COUNT(*) FILTER (WHERE status='APPROVED')::int AS approved,
            COUNT(*) FILTER (WHERE status='REJECTED')::int AS rejected,
            COALESCE(SUM(amount) FILTER (WHERE status <> 'DRAFT'), 0) AS amount_claimed
       FROM vouchers WHERE employee_id = $1`,
    [user.id]
  );
  const r = rows[0];
  return {
    totalVouchers: r.total,
    draftVouchers: r.draft,
    pendingApproval: r.pending,
    approvedVouchers: r.approved,
    rejectedVouchers: r.rejected,
    totalAmountClaimed: Number(r.amount_claimed),
  };
}

async function director() {
  const { rows } = await db.query(
    `SELECT COUNT(*) FILTER (WHERE status='PENDING_APPROVAL')::int AS pending,
            COUNT(*) FILTER (WHERE status='APPROVED' AND approved_at::date = CURRENT_DATE)::int AS approved_today,
            COUNT(*) FILTER (WHERE status='REJECTED' AND rejected_at::date = CURRENT_DATE)::int AS rejected_today,
            COALESCE(SUM(amount) FILTER (WHERE status='PENDING_APPROVAL'), 0) AS pending_amount
       FROM vouchers`
  );
  const activity = await recentActivity(8);
  const r = rows[0];
  return {
    pendingApprovalCount: r.pending,
    approvedToday: r.approved_today,
    rejectedToday: r.rejected_today,
    totalPendingAmount: Number(r.pending_amount),
    recentActivity: activity,
  };
}

async function accounts() {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status='PENDING_APPROVAL')::int AS pending,
            COUNT(*) FILTER (WHERE status='APPROVED')::int AS approved,
            COUNT(*) FILTER (WHERE status='REJECTED')::int AS rejected,
            COALESCE(SUM(amount) FILTER (WHERE status='APPROVED'), 0) AS approved_amount
       FROM vouchers WHERE status <> 'DRAFT'`
  );
  const recent = await db.query(
    `SELECT v.id, v.voucher_number, v.title, v.amount, v.approved_at, e.name AS employee_name
       FROM vouchers v JOIN users e ON e.id = v.employee_id
      WHERE v.status='APPROVED' ORDER BY v.approved_at DESC LIMIT 6`
  );
  const r = rows[0];
  return {
    totalVouchers: r.total,
    pendingApproval: r.pending,
    approvedVouchers: r.approved,
    rejectedVouchers: r.rejected,
    totalApprovedAmount: Number(r.approved_amount),
    recentApproved: recent.rows.map((v) => ({
      id: v.id,
      voucherNumber: v.voucher_number,
      title: v.title,
      amount: v.amount,
      employeeName: v.employee_name,
      approvedAt: v.approved_at,
    })),
  };
}

async function recentActivity(limit) {
  const { rows } = await db.query(
    `SELECT ev.id, ev.to_status, ev.created_at, v.id AS voucher_id, v.voucher_number, v.title, v.amount,
            u.name AS actor_name, e.name AS employee_name
       FROM voucher_events ev
       JOIN vouchers v ON v.id = ev.voucher_id
       JOIN users u ON u.id = ev.actor_id
       JOIN users e ON e.id = v.employee_id
      WHERE ev.to_status <> 'DRAFT'
      ORDER BY ev.created_at DESC, ev.id DESC LIMIT $1`,
    [limit]
  );
  return rows.map((e) => ({
    id: e.id,
    voucherId: e.voucher_id,
    voucherNumber: e.voucher_number,
    title: e.title,
    amount: e.amount,
    status: e.to_status,
    actorName: e.actor_name,
    employeeName: e.employee_name,
    at: e.created_at,
  }));
}

async function forUser(user) {
  if (user.role === ROLES.EMPLOYEE) return { role: user.role, stats: await employee(user) };
  if (user.role === ROLES.DIRECTOR) return { role: user.role, stats: await director() };
  return { role: user.role, stats: await accounts() };
}

module.exports = { forUser };
