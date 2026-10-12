-- Expense Voucher Management System: initial schema

CREATE TYPE user_role AS ENUM ('EMPLOYEE', 'DIRECTOR', 'ACCOUNTS');

CREATE TYPE voucher_status AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

CREATE TABLE users (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(120)  NOT NULL,
  email           VARCHAR(190)  NOT NULL UNIQUE,
  password_hash   VARCHAR(100)  NOT NULL,
  role            user_role     NOT NULL,
  employee_code   VARCHAR(30),
  department      VARCHAR(80),
  signature_path  VARCHAR(255),              -- optional saved signature (profile)
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Voucher numbers are generated from this sequence: VCH-<year>-<6 digit counter>
CREATE SEQUENCE voucher_number_seq START 1;

CREATE TABLE vouchers (
  id                       SERIAL PRIMARY KEY,
  voucher_number           VARCHAR(30)    NOT NULL UNIQUE,
  voucher_date             DATE           NOT NULL DEFAULT CURRENT_DATE,
  expense_date             DATE           NOT NULL,
  department               VARCHAR(80)    NOT NULL,
  title                    VARCHAR(150)   NOT NULL,
  category                 VARCHAR(50)    NOT NULL,
  description              TEXT,
  amount                   NUMERIC(12, 2) NOT NULL CHECK (amount > 0),

  employee_id              INTEGER        NOT NULL REFERENCES users(id),
  employee_signature_path  VARCHAR(255),

  status                   voucher_status NOT NULL DEFAULT 'DRAFT',
  submitted_at             TIMESTAMPTZ,

  director_id              INTEGER        REFERENCES users(id),
  director_signature_path  VARCHAR(255),
  approved_at              TIMESTAMPTZ,
  rejected_at              TIMESTAMPTZ,
  rejection_reason         TEXT,

  created_at               TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  -- Database-level guards that mirror the business rules
  CONSTRAINT chk_submitted_has_signature
    CHECK (status = 'DRAFT' OR employee_signature_path IS NOT NULL),
  CONSTRAINT chk_approved_has_director_signature
    CHECK (status <> 'APPROVED' OR director_signature_path IS NOT NULL),
  CONSTRAINT chk_rejected_has_reason
    CHECK (status <> 'REJECTED' OR (rejection_reason IS NOT NULL AND length(trim(rejection_reason)) > 0))
);

CREATE INDEX idx_vouchers_employee     ON vouchers(employee_id);
CREATE INDEX idx_vouchers_status       ON vouchers(status);
CREATE INDEX idx_vouchers_expense_date ON vouchers(expense_date);
CREATE INDEX idx_vouchers_updated_at   ON vouchers(updated_at DESC);

-- Audit trail: one row per status change
CREATE TABLE voucher_events (
  id           SERIAL PRIMARY KEY,
  voucher_id   INTEGER        NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  actor_id     INTEGER        NOT NULL REFERENCES users(id),
  from_status  voucher_status,
  to_status    voucher_status NOT NULL,
  note         TEXT,
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_voucher ON voucher_events(voucher_id);
CREATE INDEX idx_events_created ON voucher_events(created_at DESC);
