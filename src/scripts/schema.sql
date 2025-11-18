-- Tabla de clientes
CREATE TABLE IF NOT EXISTS customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         text NOT NULL UNIQUE,
  name          text,
  address       text,
  zone          text,
  last_order_id text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Tabla de órdenes
CREATE TABLE IF NOT EXISTS orders (
  id            text PRIMARY KEY,  -- ej: 'PAM-1763344334658'
  customer_id   uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  from_phone    text NOT NULL,  -- redundante, pero útil para debug rápido
  parsed        jsonb NOT NULL, -- items, zone, address, delivery, etc.
  total         integer NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'PENDING', -- 'PENDING' | 'PAID'
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Tabla de items de la orden (opcional v1, pero la dejo creada)
CREATE TABLE IF NOT EXISTS order_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  text NOT NULL,
  label       text NOT NULL,
  quantity    integer NOT NULL,
  unit        text NOT NULL
);

-- Tabla para loguear notificaciones de Mercado Pago
CREATE TABLE IF NOT EXISTS mp_notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id    text,
  status        text,
  order_id      text,
  raw_payload   jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Índices útiles
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_mp_notifications_payment_id ON mp_notifications(payment_id);
