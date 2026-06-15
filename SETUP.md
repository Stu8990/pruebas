# InvestSmart — Guía de activación del backend

## Paso 1 — Correr el SQL en Supabase
1. Ve a tu proyecto en supabase.com
2. SQL Editor → New query
3. Pega todo el contenido de `schema.sql` y corre

## Paso 2 — Instalar Supabase CLI (una sola vez)
```bash
npm install -g supabase
```
Verifica con: `supabase --version`

## Paso 3 — Vincular tu proyecto y desplegar Edge Functions
```bash
# En la carpeta D:\Documentos\pruebas\
supabase login
supabase link --project-ref fjufxwkhjgbkhqvpmryb
supabase functions deploy market-data
supabase functions deploy xtb-sync
```

## Paso 4 — Configurar la variable secreta de XTB (Edge Function)
La Edge Function xtb-sync necesita acceso admin a Supabase.
```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<tu-service-role-key>
```
La service_role key la encuentras en:
Supabase → Settings → API → service_role (NUNCA en el HTML)

## Paso 5 — Configurar Supabase Auth
En tu Supabase dashboard:
- Authentication → Providers → Email → Enable "Email OTP" (no magic link)
- Authentication → URL Configuration → Site URL → http://localhost (o tu dominio)

## Qué funciona sin deploy de Edge Functions
- ✅ Login con OTP por correo
- ✅ Historial guardado en Supabase
- ✅ Sincronización entre dispositivos
- ✅ Nuevo registro manual

## Qué funciona después del deploy
- ✅ Precios reales en tiempo real (Yahoo Finance)
- ✅ PER automático de tus 7 acciones
- ✅ Recomendaciones de analistas de Wall Street
- ✅ Noticias recientes por acción
- ✅ Sync automático desde XTB (sin copiar nada)

## XTB API — notas importantes
- La API de XTB es WebSocket (wss://ws.xtb.com/real)
- Las credenciales se guardan en Supabase server-side, nunca en el browser
- El rendimiento % se calcula como: ganancia_USD / capital_invertido * 100
- Si tienes cuenta demo usa la opción "cuenta demo" en el formulario
