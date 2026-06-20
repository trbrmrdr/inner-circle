# Standalone API deployment

Standalone API deployment for a VPS where Inner Circle owns ports `80/443`.
Use this for Germany / primary API.

Public URL:

```text
https://api.inner-circle.spi.ski
```

Layout on the server:

```text
/opt/server.inner-circle-germany
├── private                 # service account, Telegram sessions
├── scripts/media           # host-side media helper scripts
└── tmp                     # persistent Docker volume mounted to /app/tmp
    ├── autopost            # source files, Telegram/VK/Instagram prepared files, manifests
    ├── logs
    ├── media
    └── work                # temporary conversion work files
```

`tmp` and `private` are excluded from deploy rsync, so container rebuilds do not delete downloaded media, converted files, manifests, logs, or sessions.
The server container uses `restart: unless-stopped`.

Run:

```bash
cd server
npm run deploy:ip
```

Caddy reads `PUBLIC_HOST` from `.env` and automatically issues HTTPS certificates.

Do not use this compose profile on the Moscow host while the central
`/Users/trbrmrdr/Documents/Project/Spi.Ski/server.host` project owns
`Caddyfile`, `docker-compose.yml`, and ports `80/443`.

Useful checks:

```bash
npm run deploy:network
npm run deploy:static
curl https://api.inner-circle.spi.ski/api/autopost/health
```
