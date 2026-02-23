# dvisual

Monorepo npm con `api/` (Elysia + SQLite) y `web/` (React + Vite).

## Uso con npm

1. Instalar dependencias:
```bash
npm install
```
2. Desarrollo (API + web):
```bash
npm run dev
```
3. Build:
```bash
npm run build
```
4. Produccion API:
```bash
npm run start
```

## Variables recomendadas

- `PORT`: puerto de la API (default `3000`)
- `GROQ_API_KEY`: llave de Groq para `/api/ask`
- `VITE_API_URL`: URL base de API para frontend (default `/api`)
- `VITE_API_PROXY_TARGET`: target del proxy Vite en dev (default `http://localhost:3000`)
