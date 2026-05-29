# Cinephilers

A movie social web app. Track, rate, discover, and discuss movies with friends.

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL (Neon) via Prisma ORM
- **Auth**: JWT (httpOnly cookies) + bcrypt
- **Email**: Nodemailer (SMTP)
- **Data**: TMDB API

---

## Setup

### 1. Clone & install

```bash
git clone <repo>
cd cinephilers
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

Fill in every value in `.env.local`. See `.env.example` for descriptions.

### 3. Neon DB setup

1. Go to [neon.tech](https://neon.tech) and create a free project.
2. Copy the **Connection string** (it starts with `postgresql://`).
3. Paste it as `DATABASE_URL` in `.env.local`.

### 4. Generate Prisma client & migrate

```bash
npm run db:generate   # generate Prisma client types
npm run db:migrate    # apply schema to Neon (creates tables)
```

For quick prototyping you can also use `npm run db:push` instead of migrate.

### 5. Seed demo data (optional)

```bash
npm run db:seed
```

Demo account: `demo@cinephilers.app` / `Password123!`

### 6. Run

```bash
npm run dev
```

---

## Auth Flow

| Route | Description |
|-------|-------------|
| `/signup` | Create account → verification email sent |
| `/login` | Sign in → sets httpOnly JWT cookies |
| `/forgot-password` | Request password reset email |
| `/reset-password?token=…` | Set new password |
| `/verify-email?token=…` | Verify email address |

Protected pages (`/profile`, `/social`, `/history`, `/friends`) redirect unauthenticated users to `/login`.

---

## API Endpoints

All responses: `{ success, data, message, pagination? }`

### Auth
| Method | Path | Auth |
|--------|------|------|
| POST | `/api/auth/register` | — |
| POST | `/api/auth/login` | — |
| POST | `/api/auth/logout` | Optional |
| POST | `/api/auth/refresh` | Cookie |
| POST | `/api/auth/forgot-password` | — |
| POST | `/api/auth/reset-password` | — |
| POST | `/api/auth/verify-email` | — |

### Users
| Method | Path | Auth |
|--------|------|------|
| GET | `/api/users/me` | Required |
| PUT | `/api/users/me` | Required |
| DELETE | `/api/users/me` | Required |
| GET | `/api/users/:username` | Optional |
| GET | `/api/users/:username/ratings` | Optional |
| GET | `/api/users/:username/reviews` | Optional |
| GET | `/api/users/:username/watched` | Optional |
| GET | `/api/users/:username/watchlist` | Optional |
| GET | `/api/users/:username/favorites` | Optional |
| GET | `/api/users/:username/lists` | Optional |
| POST/DELETE | `/api/users/:username/follow` | Required |
| GET | `/api/users/:username/followers` | Optional |
| GET | `/api/users/:username/following` | Optional |
| GET | `/api/users/:username/badges` | Optional |

### Content
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ratings` | Upsert rating 1–10 |
| DELETE | `/api/ratings/:tmdbId?mediaType=` | Remove rating |
| POST | `/api/reviews` | Create/update review |
| PUT | `/api/reviews/:id` | Edit review |
| DELETE | `/api/reviews/:id` | Delete review |
| POST/DELETE | `/api/reviews/:id/like` | Like/unlike |
| POST | `/api/watched` | Mark watched |
| DELETE | `/api/watched/:tmdbId?mediaType=` | Unmark |
| POST | `/api/watchlist` | Add to watchlist |
| DELETE | `/api/watchlist/:tmdbId?mediaType=` | Remove |
| POST | `/api/favorites` | Add favorite (max 4) |
| DELETE | `/api/favorites/:tmdbId?mediaType=` | Remove |
| POST | `/api/lists` | Create list |
| GET/PUT/DELETE | `/api/lists/:id` | Manage list |
| POST | `/api/lists/:id/items` | Add item |
| DELETE | `/api/lists/:id/items/:tmdbId?mediaType=` | Remove item |

---

## Badge Tiers

| Tier | Ratings needed |
|------|---------------|
| Grey | 0 (on sign-up) |
| Bronze | 25 |
| Silver | 100 |
| Gold | 500 |

Badges are auto-awarded when `ratingsCount` crosses each threshold.
