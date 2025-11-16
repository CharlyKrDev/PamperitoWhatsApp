# Decisiones técnicas (v1.1)

## Canal y capa de integración

- **Canal principal**: WhatsApp Cloud API (Meta).
- **Integración**: 
  - `src/modules/whatsApp/services/whatsApp.api.js` encapsula las llamadas a Meta:
    - Envío de textos simples.
    - Botones interactivos (menú, confirmar nombre/dirección, método de pago, etc).
    - Listas de productos.
  - Webhook:
    - `GET /webhook/whatsapp` → verificación de webhook (VERIFY_TOKEN).
    - `POST /webhook/whatsapp` → recepción de mensajes.

## Pagos

- **Proveedor**: Mercado Pago.
- **Modo actual**: Modo prueba / demo hasta alta real.
- **Flujo**:
  - El bot genera una orden local (`orders.json`) con estado `PENDING`.
  - Si el cliente elige **MercadoPago**:
    - Se crea una preferencia (`createPreference`) y se le envía el link.
    - El admin recibe una notificación con medio de pago **"MercadoPago (PENDIENTE)"**.
  - Si el cliente elige **Efectivo**:
    - El admin recibe una notificación con medio de pago **"Efectivo (AL ENTREGAR)"**.
  - Webhook MP:
    - `POST /webhook/mp` consulta el pago por `paymentId`.
    - Si el pago está `approved`:
      - Marca la orden como pagada (`markPaid`).
      - Envía confirmación al cliente.
      - Envía confirmación al admin con estado **PAGADO**.

- **Configuración por .env**:
  - `ENABLE_MP=true/false`
  - `ENABLE_CASH=true/false`
  - Si ambos están en `false`, el bot fuerza a mostrar las dos opciones.

## Persistencia (v1)

- **Órdenes**: `src/db/orders.json` (manejado desde `mp.api.js`).
- **Clientes**: `src/db/customers.json` (manejado desde `customers.api.js`).
- **Catálogo**: `src/db/catalog.json` con precios por tramo (1–9, 10–19, 20+).
- **Objetivo futuro**: migrar a PostgreSQL (Supabase) para:
  - Panel admin.
  - Reportes.
  - Historial por cliente.

## Estado de sesión y flujo conversacional

- Estado de la conversación por cliente en memoria:
  - `sessionState: Map<phone, SessionState>`.
  - Pasos principales:
    - `ASK_NAME` / `CONFIRM_NAME`
    - `CART_IDLE` / `ASK_QTY_PRODUCT` / `ASK_MORE`
    - `ASK_ADDRESS` / `CONFIRM_ADDRESS`
    - `ASK_DELIVERY_DAY` / `ASK_DELIVERY_SLOT`
    - `ASK_PAYMENT_METHOD`
- Comando global:
  - El cliente puede escribir **"cancelar"** para:
    - Borrar el estado de sesión actual.
    - Volver al menú principal.
- Detección de problemas:
  - `troubleState: Map<phone, count>`.
  - A partir de cierto número de mensajes que el bot no entiende:
    - Se avisa al cliente que alguien del local lo va a contactar.
    - Se notifica al admin por WhatsApp (si `ADMIN_PHONE` está configurado).

> **Nota**: el uso de Map en memoria es suficiente para un único proceso.  
> Para escalado horizontal o reinicios frecuentes de servidor se evaluará usar Redis o DB.

## Deploy

- **Estado actual**: ejecución local durante desarrollo.
- **Opciones evaluadas**:
  - Render / Railway para un deploy simple.
  - VPS propio para mayor control.
- Requisito clave: exponer el servidor por HTTPS (ngrok o dominio propio) para:
  - Webhook de WhatsApp Cloud API.
  - Webhook de Mercado Pago.

## Pendientes v2

- Panel admin (Next.js) o comandos admin por WhatsApp:
  - Listado de pedidos.
  - Cambio manual de estado.
  - Filtros por fecha/cliente.
- Historial por cliente:
  - Pedidos anteriores, direcciones usadas, zonas de entrega.
- Reportes:
  - Ventas por producto / rango de fechas.
  - Tickets promedio.
  - Conversión pedidos iniciados vs confirmados.
- Persistencia en PostgreSQL (Supabase) para reemplazar JSON local.
