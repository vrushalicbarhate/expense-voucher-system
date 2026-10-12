const { z } = require('zod');
const { CATEGORIES, STATUS } = require('./constants');

const isoDate = z
  .string({ required_error: 'Date is required' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');

const today = () => new Date().toISOString().slice(0, 10);

// Fields shared by create and update (multipart sends everything as strings).
const voucherFields = {
  department: z.string({ required_error: 'Department is required' }).trim().min(1, 'Department is required').max(80),
  title: z.string({ required_error: 'Expense title is required' }).trim().min(1, 'Expense title is required').max(150),
  expenseDate: isoDate
    .refine((v) => v <= today(), 'Expense date cannot be in the future'),
  category: z.enum(CATEGORIES, { errorMap: () => ({ message: 'Choose a valid category' }) }),
  description: z.string().trim().max(2000).optional().default(''),
  amount: z.coerce
    .number({ invalid_type_error: 'Amount must be a number', required_error: 'Amount is required' })
    .gt(0, 'Amount must be greater than zero')
    .max(99999999.99, 'Amount is too large')
    .refine((v) => Math.round(v * 100) === v * 100 || Math.abs(Math.round(v * 100) - v * 100) < 1e-6, 'Use at most 2 decimal places'),
};

const voucherBody = z.object(voucherFields);

const rejectBody = z.object({
  reason: z
    .string({ required_error: 'Rejection reason is required' })
    .trim()
    .min(1, 'Rejection reason is required')
    .max(1000),
});

const approveBody = z.object({
  useSavedSignature: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

const loginBody = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

const SORTABLE = {
  voucherNumber: 'v.voucher_number',
  expenseDate: 'v.expense_date',
  voucherDate: 'v.voucher_date',
  amount: 'v.amount',
  status: 'v.status',
  employeeName: 'e.name',
  department: 'v.department',
  updatedAt: 'v.updated_at',
  createdAt: 'v.created_at',
};

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.nativeEnum(STATUS).optional(),
  department: z.string().trim().max(80).optional(),
  category: z.string().trim().max(50).optional(),
  employeeName: z.string().trim().max(120).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  minAmount: z.coerce.number().min(0).optional(),
  maxAmount: z.coerce.number().min(0).optional(),
  sortBy: z.enum(Object.keys(SORTABLE)).optional().default('updatedAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
});

module.exports = { voucherBody, rejectBody, approveBody, loginBody, listQuery, SORTABLE };
