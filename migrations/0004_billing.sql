-- Checkout orders, phone handoff rows, and short support notes.
-- Credit deductions stay in credit_ledger (no new jobs columns).

CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits > 0),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'closed')),
  payment_request_id TEXT NOT NULL UNIQUE,
  acquiring_order_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (user_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_user
  ON payment_orders (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS phone_uploads (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  template_slug TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK (slot IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('open', 'ready')),
  content_type TEXT,
  byte_length INTEGER,
  object_key TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (user_id)
);

CREATE TABLE IF NOT EXISTS support_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (user_id)
);
