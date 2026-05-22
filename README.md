# pm

A monorepo project using **Strapi v5** (backend), **Next.js 15 + App Router** (frontend), and **Tailwind CSS** (styling).

## Structure

```
pm/
├── backend/    # Strapi v5 CMS (TypeScript, SQLite for local dev)
├── frontend/   # Next.js 15 with Tailwind CSS (TypeScript, App Router)
└── package.json
```

## Requirements

- Node.js **≥20 ≤24** (Strapi requirement)
- npm ≥8

## Getting started

### 1. Install all dependencies

```bash
npm install
```

### 2. Start both services concurrently

```bash
npm run dev
```

Or start them individually:

```bash
npm run dev:backend    # Strapi at http://localhost:1339
npm run dev:frontend   # Next.js at http://localhost:3002
```

### 3. Set up Strapi

1. Open [http://localhost:1339/admin](http://localhost:1339/admin) and create your first admin user.
2. Use the **Content-Type Builder** to create content types.
3. Set permissions under **Settings → Roles → Public** so the API is accessible.

## Environment variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `HOST` | `0.0.0.0` | Strapi server host |
| `PORT` | `1339` | Strapi server port |
| `DATABASE_CLIENT` | `sqlite` | Database client |
| `FRONTEND_URL` | `http://localhost:3002` | Allowed CORS origin |

### Frontend (`frontend/.env.local`)

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_STRAPI_URL` | `http://localhost:1339` | Strapi API base URL |

## Fetching data from Strapi

Use the `strapiGet` helper in any Server Component:

```tsx
import { strapiGet } from '@/lib/strapi';

type Article = { id: number; documentId: string; title: string };

const { data } = await strapiGet<Article[]>('/articles?populate=*');
```

## Tech stack

| Layer | Technology |
|---|---|
| Backend CMS | Strapi v5 (TypeScript) |
| Frontend | Next.js 15, React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Database (dev) | SQLite |
