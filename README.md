# 🔥 Pamperito WhatsApp Bot

Asistente automático para tomar pedidos de **leña y carbón** vía **WhatsApp**, integrado con **Mercado Pago** y pensado para pequeños emprendimientos como Pamperito.

El bot:
- Atiende a los clientes por WhatsApp (Cloud API).
- Pide nombre, producto, cantidad, dirección y horario de entrega.
- Calcula el total según un **catálogo de precios por tramos**.
- Permite elegir medio de pago (**MercadoPago** o **efectivo**).
- Notifica al administrador (Dante) cuando hay pedidos nuevos o problemas.

---

## ✨ Características principales

- 🤖 **Atención automática por WhatsApp Cloud API**
  - Menú principal con botones.
  - Lista de productos (leñas, carbones, extras).
  - Detección de zonas y horarios de entrega.

- 🔁 **Repetir último pedido**
  - El cliente puede repetir su último pedido con **precios actualizados**.
  - El bot vuelve a pedir dirección y rango horario antes de confirmar.

- 💳 **Medios de pago configurables**
  - Mercado Pago (link de pago).
  - Efectivo (al entregar).
  - Habilitables/deshabilitables vía `.env`:
    - `ENABLE_MP=true/false`
    - `ENABLE_CASH=true/false`

- 👤 **Gestión básica de clientes**
  - Guarda nombre y teléfono.
  - Asocia el último pedido realizado.

- 🧾 **Persistencia simple**
  - `catalog.json` para productos y precios.
  - `customers.json` para clientes.
  - `orders.json` para pedidos.

- 🚨 **Detección de problemas**
  - Si el bot no entiende varios mensajes seguidos:
    - Avisa al cliente que alguien del local lo va a ayudar.
    - Notifica al administrador por WhatsApp (si `ADMIN_PHONE` está configurado).

- ❌ **Cancelar pedido en cualquier momento**
  - El cliente puede escribir `cancelar` para:
    - borrar el flujo actual,
    - volver al menú principal.

---

## 🧱 Arquitectura

- **Backend**: Node.js + Express.
- **Rutas principales**:
  - `GET /` → Health check (“🔥 Pamperito Bot corriendo OK”).
  - `GET /webhook/whatsapp` → verificación de webhook de Meta.
  - `POST /webhook/whatsapp` → recepción de mensajes.
  - `POST /webhook/mp` → webhook de Mercado Pago.
- **Módulos**:
  - `modules/whatsApp`
    - `controllers/whatsapp.controller.js` → flujo conversacional.
    - `services/whatsApp.api.js` → integración con WhatsApp Cloud API.
    - `constants/blackList.js` → palabras a ignorar al leer el nombre.
  - `modules/mercadoPago`
    - `controllers/mp.controller.js` → procesamiento webhook MP.
    - `services/mp.api.js` → persistencia de órdenes, creación de preferencias, etc.
  - `modules/customers`
    - `services/customers.api.js` → gestión de clientes en `customers.json`.
  - `utils`
    - `calc.js` → catálogo + cálculo de totales + parser de texto.
    - `helpers.js` → utilidades varias.

Más detalles en `src/docs/decisiones_tecnicas.md`.

---

## 🧩 Tecnologías

- Node.js + Express
- WhatsApp Cloud API (Meta)
- Mercado Pago (Pagos online)
- Archivos JSON como almacenamiento local (v1)
- Dotenv para variables de entorno

---

## ⚙️ Configuración de entorno

Este proyecto **no** incluye el `.env` por seguridad.  
Usá este ejemplo como base en un archivo `.env` local:

```env
# === Meta / WhatsApp Cloud API ===
WHATSAPP_TOKEN=tu_token_de_meta
WHATSAPP_PHONE_ID="tu_phone_id"
WHATSAPP_VERIFY_TOKEN=pamperito-verify-2025
META_GRAPH_VERSION=v19.0
META_GRAPH_BASE=https://graph.facebook.com

# === Mercado Pago ===
MP_ACCESS_TOKEN=tu_access_token_mp
MP_PUBLIC_KEY=tu_public_key_mp
MP_WEBHOOK_SECRET=tu_webhook_secret
MP_WEBHOOK_URL=https://tu-dominio/webhook/mp

# === Opciones de pago ===
ENABLE_CASH=true
ENABLE_MP=true

# === General ===
PORT=3000
ADMIN_PHONE=549xxxxxxxxxx  # número del admin en formato internacional

📂 Estructura de carpetas (resumen)
src/
  app.js
  server.js
  db/
    catalog.json
    customers.json
    orders.json
  docs/
    decisiones_tecnicas.md
    manual_operativo_admin.md   # (sugerido)
  modules/
    whatsApp/
      constants/
      controllers/
      routes/
      services/
    mercadoPago/
      controllers/
      routes/
      services/
    customers/
      services/
  utils/
    calc.js
    helpers.js
scripts/
  healthcheck.js
  seed.local.js
