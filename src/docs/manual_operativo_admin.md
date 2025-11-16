Contenido sugerido:

```md
# Manual operativo - Admin Pamperito

Este documento está pensado para el administrador (Dante) que recibe los avisos del bot de WhatsApp.

---

## 1. Qué hace el bot

El bot de Pamperito:

1. Atiende a los clientes por WhatsApp.
2. Pide:
   - nombre,
   - producto y cantidad,
   - dirección de entrega,
   - día y rango horario sugeridos,
   - método de pago.
3. Calcula el total según el catálogo de productos.
4. Registra el pedido en el sistema.
5. Te avisa por WhatsApp cuando:
   - hay un **nuevo pedido**,
   - hay **problemas con un cliente**,
   - se **aprueba un pago por MercadoPago**.

---

## 2. Tipos de mensajes que recibe el Admin

### 2.1. Nuevo pedido (pago en EFECTIVO)

Cuando un cliente termina un pedido y elige pagar en efectivo, vas a recibir algo así:

```txt
🧾 Nuevo pedido recibido

5 x Carbón - bolsa 5kg, 2 x Leña - bolsa 20kg (zona: Venado Tuerto) por un total de $35000
📍 Dirección: San Martín 1234, barrio Centro
🚚 Entrega sugerida: Mañana (12/11) - 16:00 a 18:00 hs

👤 Nombre: Juan
📞 Teléfono: 54911xxxxxxxx
💳 Medio de pago: Efectivo (AL ENTREGAR)

### Qué significa:

- El pedido está confirmado en el sistema.

- El cliente pagará cuando reciba la mercadería.

- Podés organizar el reparto con esa info.

2.2. Nuevo pedido (MercadoPago PENDIENTE)

Si el cliente elige pagar por MercadoPago, primero recibís:

🧾 Nuevo pedido recibido

... (detalle del pedido) ...

👤 Nombre: Juan
📞 Teléfono: 54911xxxxxxxx
💳 Medio de pago: MercadoPago (PENDIENTE)

### Qué significa:

- El cliente eligió pagar con MercadoPago.

- Todavía NO está confirmado el pago.

- El bot le mandó un link de pago al cliente.

- No hace falta que hagas nada todavía.
- Esperá el siguiente mensaje.

### 2.3. Pago aprobado por MercadoPago

Cuando MercadoPago confirma el pago de un pedido, vas a recibir:

✅ Pago aprobado por MercadoPago

Pedido: PAM-123456
Cliente: 54911xxxxxxxx
Total: $35000
Estado: PAGADO

### Qué significa:

- El pago está APROBADO.

- El pedido está listo para ser preparado y entregado.

- Si querés, podés escribirle al cliente desde el número del negocio para coordinar detalles adicionales.

### 2.4. Cliente con dificultades para usar el bot

Si el bot intenta ayudar al cliente y no entiende varios mensajes seguidos, vas a recibir:

⚠ Cliente con dificultades para operar con el bot.

📞 Número: 54911xxxxxxxx
📝 Último mensaje: "no me anda esto del menú"

Revisá la conversación y, si hace falta, contactalo desde el número del negocio.

Qué hacer:

1) Abrí el chat de WhatsApp de ese número.

2) Leé la conversación para entender en qué se trabó.

3) Si hace falta, escribile o llamalo desde el número del negocio y tomale el pedido a mano.

### 3. Cómo funcionan los pedidos y los IDs

Cada pedido tiene un identificador del tipo:

PAM-123456

### Este ID se usa para:

- referenciar el pedido en el sistema,

- identificar el pago en MercadoPago (external_reference),

- permitir que el cliente escriba:

- pago ok PAM-123456 si hace un pago por fuera del link.

### 4. Repetir pedido

Si un cliente ya compró antes, cuando escribe "hola" el bot:

1) Le recuerda su pedido anterior.

2) Le ofrece un botón: “🔁 Repetir pedido”.

Si el cliente acepta:

- El bot arma el mismo pedido pero con precios actuales.

- Le vuelve a pedir dirección y rango horario.

- Luego pide método de pago (igual que un pedido nuevo).