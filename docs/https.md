# HTTPS for Local Keep

Local Keep reuses the same mkcert development certificate as the other local
services in `/home/tom/projects/certs`:

- `/home/tom/projects/certs/server.pem`
- `/home/tom/projects/certs/server-key.pem`

The certificate has a SAN for **192.168.3.222** (not `localhost`). Use the IP in
the browser:

```text
https://192.168.3.222:5174
```

`https://localhost:5174` will show a certificate-name mismatch because the SAN
does not include localhost.

## How it works

- Vite serves the frontend over TLS on `:5174` (`server.https` in `vite.config.js`).
- The Express backend stays HTTP on `:5173` inside the container.
- Vite proxies `/api`, `/mcp`, and `/ws` to the backend. The browser only talks
  to the HTTPS origin, so REST and WebSocket requests are same-origin and
  encrypted to the host.
- `wss://` is selected automatically by the client when the page is HTTPS.
- MCP clients that connect directly to the backend (`http://localhost:5173/mcp`)
  are unaffected. Browser-based MCP hosts can use `https://192.168.3.222:5174/mcp`.

## Configuration

`docker-compose.yml` mounts the certificate directory read-only and sets:

```yaml
environment:
  - VITE_HTTPS_CERT=/app/certs/server.pem
  - VITE_HTTPS_KEY=/app/certs/server-key.pem
  - COOKIE_SECURE=1
  - LOCAL_KEEP_PUBLIC_URL=${LOCAL_KEEP_PUBLIC_URL:-https://192.168.3.222:5174}
volumes:
  - ${LOCAL_KEEP_CERTS_DIR:-/home/tom/projects/certs}:/app/certs:ro
```

Override the paths without editing the compose file:

```bash
LOCAL_KEEP_CERTS_DIR=/path/to/certs \
LOCAL_KEEP_PUBLIC_URL=https://notes.example.test:5174 \
docker compose up -d
```

If the cert files are missing, Vite falls back to HTTP. Changing certificate
files requires a restart:

```bash
docker compose restart app
```

## Notes

- Login cookies are marked `Secure` via `COOKIE_SECURE=1`, so use the HTTPS URL.
- If you use a different hostname/IP, issue a certificate whose SAN matches it
  (or add it to the mkcert cert) and update `LOCAL_KEEP_PUBLIC_URL`.
- Dev ports are pinned per address in `docker-compose.yml`, never `0.0.0.0`:
  `5173` publishes on `127.0.0.1` only (host MCP/API clients), `5174` on
  `${LOCAL_KEEP_BIND:-192.168.3.222}` (LAN browsers). The host has a public IPv6
  prefix, so a wildcard publish would expose the dev server to the internet.
- One bind per port: rootlesskit's port driver rejects the same host port bound
  to two addresses ("address already in use"), so LAN machines cannot reach the
  raw backend on 5173. They use the Vite origin on 5174, which proxies `/api`,
  `/mcp`, and `/ws`.
