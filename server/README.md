# Inner Circle server

Minimal Express server for:

- lead intake from the site;
- lead fan-out to email and Telegram tech chat;
- Google Sheets based autoposting queue;
- posting to Telegram, VK, Instagram, and later Facebook;
- DeepSeek text preparation before posting.

## Commands

```bash
npm install
npm run build
npm run dev
```

Production-like local run:

```bash
npm run build
npm start
```

## Main files

- `src/server.ts` - Express entrypoint.
- `src/core/AutoPostRunner.ts` - one visible autoposting orchestration point.
- `src/core/LeadProcessor.ts` - one visible lead intake orchestration point.
- `src/publishers/*Publisher.ts` - one static class per network.
- `src/sheets/GoogleSheetsService.ts` - Google Sheets queue and logs.
- `src/config/*Config.ts` - constants per service/network.
- `RULES.md` - architecture and Google Sheets rules.

## First run

1. Copy `.env.example` to `.env`.
2. Fill only the services you want to test.
3. Keep `AUTOPOST_ENABLED=false` until Google Sheets columns are ready.
4. Run `npm run dev`.
5. Check `GET http://localhost:4100/api/autopost/health`.

All publishers return a safe `disabled` result if their config is incomplete.
