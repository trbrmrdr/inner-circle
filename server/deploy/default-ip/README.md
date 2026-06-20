# Default IP deployment

Temporary deployment for a VPS before DNS is pointed to it.

Public URL:

```text
http://78.17.131.89
```

Layout on the server:

```text
/opt/server.inner-circle
```

Run:

```bash
cd server
npm run deploy:ip
```

All external integrations and autoposting are disabled in `.env.disabled`.
After DNS is ready, change `PUBLIC_BASE_URL` and replace the Caddyfile host
from `:80` to `api.inner-circle.spi.ski`.

Useful checks:

```bash
npm run deploy:network
npm run deploy:static
curl http://78.17.131.89/api/autopost/health
```
