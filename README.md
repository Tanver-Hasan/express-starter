# Express Starter

## Endpoints

- `/` – Home page (EJS)
- `/about` – About page (EJS)
- `/status` – Runtime status page (EJS)
- `/protected` – Protected page (requires Cloudflare Access JWT)
- `/logout` – Clears Cloudflare Access cookie and redirects
- `/debug/headers` – Returns request headers/cookies for debugging
- `/api` – OpenAPI-mounted REST API
  - `/api/products` – CRUD operations (per OpenAPI spec)
  - `/api/products/{productId}` – Item operations (per OpenAPI spec)
  - `/api/health` – Health check
  - `/api/status` – Status JSON
- `/api/docs` – Swagger UI for the API

## Development

- `npm start` – Run the server
- `npm run dev` – (Requires nodemon) auto-restarts on changes
