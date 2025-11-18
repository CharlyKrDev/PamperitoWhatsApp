-- ===========================================
-- Esquema mínimo Pamperito VT - Supabase
-- ===========================================

-- (Opcional) Zona horaria por defecto
SET TIME ZONE 'UTC';

-- ===========================================
-- Tabla: customers
-- Clientes identificados por número de WhatsApp
-- ===========================================

CREATE TABLE IF NOT EXISTS customers (
  id            BIGSERIAL PRIMARY KEY,
  phone         VARCHAR(32) NOT NULL UNIQUE, -- ej: '549342...'
  name          TEXT,
  address       TEXT,
  zone          TEXT,
  last_order_id TEXT,                         -- referencia textual tipo 'PAM-xxxx'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_phone
  ON customers (phone);

-- ===========================================
-- Tabla: orders
-- Cada pedido realizado por WhatsApp
-- id usa el código que ya usás: 'PAM-<timestamp>'
-- ===========================================

CREATE TABLE IF NOT EXISTS orders (
  id          TEXT PRIMARY KEY,                -- 'PAM-1763344334658'
  customer_id BIGINT REFERENCES customers(id),
  phone       VARCHAR(32) NOT NULL,            -- redundante, rápido de buscar
  total       NUMERIC(12,2) NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING' | 'PAID' | 'CANCELLED' | etc.
  parsed      JSONB,                           -- el objeto parsed que hoy guardás en JSON
  meta        JSONB,                           -- meta: { paymentMethod, ... }
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_phone
  ON orders (phone);

CREATE INDEX IF NOT EXISTS idx_orders_status
  ON orders (status);

-- ===========================================
-- Tabla: order_items
-- Items individuales de cada pedido
-- ===========================================

CREATE TABLE IF NOT EXISTS order_items (
  id          BIGSERIAL PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL,        -- ej: 'lenia_10kg'
  label       TEXT,
  quantity    INTEGER NOT NULL DEFAULT 1,
  unit        TEXT,                 -- 'bolsa', 'unidad', etc.
  unit_price  NUMERIC(12,2),        -- precio unitario aplicado
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON order_items (order_id);

-- ===========================================
-- Tabla: payments
-- Registro de pagos asociados a órdenes
-- (uno o varios pagos por pedido si en el futuro se complica)
-- ===========================================

CREATE TABLE IF NOT EXISTS payments (
  id             BIGSERIAL PRIMARY KEY,
  order_id       TEXT REFERENCES orders(id),
  mp_payment_id  TEXT,             -- id de MercadoPago (134141413636, etc.)
  status         TEXT,             -- 'approved', 'pending', 'rejected', etc.
  amount         NUMERIC(12,2),
  raw            JSONB,            -- respuesta completa de MP (por si hace falta)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id
  ON payments (order_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_payments_mp_payment_id
  ON payments (mp_payment_id);

-- ===========================================
-- Tabla: mp_notifications
-- Log de webhooks que llegan desde Mercado Pago
-- para debugging / auditoría
-- ===========================================

CREATE TABLE IF NOT EXISTS mp_notifications (
  id            BIGSERIAL PRIMARY KEY,
  topic         TEXT,         -- 'payment', 'merchant_order', etc.
  mp_payment_id TEXT,
  payload       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mp_notifications_payment_id
  ON mp_notifications (mp_payment_id);

-- ===========================================
-- Triggers para updated_at (opcional, pero prolijo)
-- ===========================================

-- Función genérica para auto-actualizar updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger en customers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_customers_updated_at'
  ) THEN
    CREATE TRIGGER trg_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

-- Trigger en orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_orders_updated_at'
  ) THEN
    CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;
