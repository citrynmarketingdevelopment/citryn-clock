# Citryn Clock

Monorepo with:

- `web/`: Next.js app (admin + employee web UI, API routes, Prisma, Neon/Postgres)
- `mobile/`: Flutter employee app (clock in/out + timesheet view via Next.js API)

## Quick Start

1. Configure backend env:

```bash
cd web
cp .env.example .env
```

2. Fill `web/.env` with secure values:

- `DATABASE_URL` (Neon/Postgres)
- `JWT_SECRET` (long random string)
- `ADMIN_EMAIL`
- `ADMIN_NAME`
- `ADMIN_PASSWORD`

3. Install and initialize:

```bash
cd web
npm install
npx prisma generate
npx prisma db push
npx prisma db seed
npm run dev
```

4. Open `http://localhost:3000` and login with seeded admin credentials.

5. Flutter app:

```bash
cd mobile
flutter pub get
flutter run --dart-define=API_BASE_URL=http://localhost:3000
```

If you need full Flutter platform folders, run `flutter create .` inside `mobile/` before `flutter run`.

## Security

- Database credentials remain server-side in `web/.env`.
- Next.js API routes access Prisma directly; no DB secrets are sent to client/mobile.
- Auth uses HTTP-only JWT cookie for web.
- Mobile uses bearer token from login response for API calls.

