# Configuración de Gmail API

El backend envía recuperación de contraseña mediante Gmail API HTTPS con OAuth 2.0 offline. Configurar en el entorno de despliegue:

```env
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
EMAIL_FROM=Instituto <cuenta-remitente@example.com>
FRONTEND_URL=https://frontend.example.com
```

`EMAIL_FROM` debe coincidir con la cuenta autorizada por OAuth o con un alias configurado en esa cuenta. No guardar secretos reales en el repositorio, documentación, logs ni respuestas.

Las variables `SMTP_*` quedaron obsoletas y deben quitarse manualmente del panel de Railway; este cambio no modifica el panel ni el `.env` local. La autorización OAuth debe limitarse al permiso de envío (`gmail.send`).

Validar la configuración en un entorno separado, sin cuentas ni datos productivos. Para pruebas controladas puede usarse un token de testing con vigencia de 7 días; nunca reutilizarlo en producción.
