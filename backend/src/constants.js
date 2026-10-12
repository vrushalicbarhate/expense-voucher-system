const ROLES = { EMPLOYEE: 'EMPLOYEE', DIRECTOR: 'DIRECTOR', ACCOUNTS: 'ACCOUNTS' };

const STATUS = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
};

// Allowed workflow transitions. Anything not listed here is illegal.
const TRANSITIONS = {
  DRAFT: ['PENDING_APPROVAL'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
  APPROVED: [],
  REJECTED: [],
};

const CATEGORIES = [
  'Travel',
  'Accommodation',
  'Meals',
  'Office Supplies',
  'Software & Subscriptions',
  'Training',
  'Client Entertainment',
  'Other',
];

module.exports = { ROLES, STATUS, TRANSITIONS, CATEGORIES };
