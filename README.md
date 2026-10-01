# Guardian Transit

Student transportation safety platform — verified drivers, live trip monitoring, and PIN-protected pickups.

---

## Overview

Guardian Transit connects students, parents/guardians, and verified drivers for safe school transportation. Key features include:

- **PIN-verified pickups** — a one-time PIN is generated per ride; the driver must enter it before the trip starts
- **Live trip tracking** — real-time location sharing via WebSocket, visible only to the connected guardian during an active ride
- **Driver verification workflow** — identity, government ID, background check, and vehicle documents reviewed by admins before a driver goes online
- **Guardian connections** — parents link to a student and receive ride notifications and live location access
- **Guardian Points & Rewards** — students earn 1 point per completed ride; 50 points unlock a free ride
- **Emergency & safety** — SOS button, emergency hotlines, safety reports, and admin incident management
- **Admin dashboard** — user management, driver verifications, ride oversight, safety reports, and system config

---

## Tech Stack

| Layer | Technology |
|---|---|
| API server | Node.js · Express · TypeScript |
| Real-time | Socket.IO |
| Database | PostgreSQL 16 · Prisma ORM |
| Auth | JWT (access + refresh tokens) · bcrypt · OTP via SMS |
| Frontend | React 19 · Vite · Tailwind CSS v4 · PWA |
| Maps | OpenStreetMap / OSRM (configurable) |

---

## Project Structure

```
GuardianTransit/
├── server/                  # Express API
│   ├── prisma/
│   │   ├── schema.prisma    # Database schema
│   │   └── seed.ts          # Dev seed data
│   └── src/
│       ├── config/env.ts    # Environment config
│       ├── lib/             # Auth, OTP, geo, sockets, tokens
│       ├── middleware/      # Auth guard, rate limiting
│       ├── routes/          # REST API routes
│       └── services/        # Ride logic, SMS, system config
└── web/                     # React SPA
    └── src/
        ├── components/      # Shared UI, map, SOS modal
        ├── pages/           # Student, parent, driver, admin views
        ├── state/           # Auth, booking, notifications contexts
        └── lib/             # API client, socket, types
```

---

## Prerequisites

- **Node.js** v18+ (v24 recommended)
- **PostgreSQL 16** running locally
- **npm** v9+

---

## Quick Start

### 1. Create the database

Open **SQL Shell (psql)** or **pgAdmin** and run:

```sql
CREATE USER guardian WITH PASSWORD 'guardian_change_me';
CREATE DATABASE guardian_transit OWNER guardian;
```

### 2. Configure environment

The server already has a `.env` at `server/.env`. The root `.env.example` documents all variables. Key values:

```env
DATABASE_URL=postgresql://guardian:guardian_change_me@127.0.0.1:5432/guardian_transit
AUTH_SECRET=<long-random-string>   # openssl rand -hex 48
SMS_PROVIDER=dev                   # logs OTPs to console in dev
MAP_PROVIDER=osrm                  # free, no API key needed
```

### 3. Install dependencies

```bash
npm install
```

### 4. Run migrations

```bash
npm run db:migrate
```

### 5. Seed dev data

```bash
npm run db:seed
```

### 6. Start the app

```bash
npm run dev
```

| Service | URL |
|---|---|
| API | http://localhost:4000 |
| Web app | http://localhost:5173 |

---

## Dev Accounts

Seeded automatically by `npm run db:seed`:

| Role | Email | Phone | Password |
|---|---|---|---|
| Student | maya@student.test | +639175550148 | Student123 |
| Parent | elena@parent.test | +639175550182 | Parent123 |
| Driver (verified) | ramon@driver.test | +639175550201 | Driver123 |
| Driver (verified) | jose@driver.test | +639175550202 | Driver123 |
| Driver (pending) | paolo@driver.test | +639175550203 | Driver123 |
| Admin | admin@guardian.test | +639175550100 | Admin1234 |

> OTPs are printed to the server console when `SMS_PROVIDER=dev`.

---

## Available Scripts

Run from the project root:

| Script | Description |
|---|---|
| `npm run dev` | Start API + web in parallel (watch mode) |
| `npm run build` | TypeScript compile + Vite production build |
| `npm run db:migrate` | Run pending Prisma migrations |
| `npm run db:seed` | Seed dev data |
| `npm run start` | Start compiled API server (production) |

Server-only scripts (`--workspace server`):

| Script | Description |
|---|---|
| `npm run db:push` | Push schema without migration (prototyping) |
| `npm run db:reset` | Drop and re-migrate (destroys data) |
| `npm run db:generate` | Regenerate Prisma client |

---

## API Routes

All routes are prefixed with `/api`.

| Prefix | Description |
|---|---|
| `/api/auth` | Register, login, OTP, refresh, logout, password reset |
| `/api/account` | Profile, avatar, password change, sessions |
| `/api/rides` | Book, track, driver transitions (accept/arrive/verify-pin/start/complete), cancel, rate |
| `/api/driver` | Driver status, location updates, active ride |
| `/api/guardians` | Guardian connection requests and management |
| `/api/students` | Student profile and saved locations |
| `/api/notifications` | List and mark-read |
| `/api/emergency` | SOS trigger, emergency log |
| `/api/safety` | Safety reports |
| `/api/rewards` | Guardian Points balance, reward redemption |
| `/api/admin` | Users, verifications, rides, reports, settings |
| `/api/meta` | Hotlines, system config, health check |

---

## WebSocket Events

The server exposes a Socket.IO namespace at `/socket.io`. Clients authenticate with the access token cookie.

| Event (server → client) | Payload |
|---|---|
| `ride:updated` | Full serialized ride object |
| `ride:location` | `{ rideId, lat, lng, speedKph, heading }` |
| `notification:new` | Notification object |
| `emergency:new` | Emergency event object |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | API server port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `AUTH_SECRET` | — | JWT signing secret (min 32 chars) |
| `ACCESS_TOKEN_TTL` | `15m` | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | `30` | Refresh token lifetime |
| `SMS_PROVIDER` | `dev` | `dev` · `log` · `twilio` · `custom` |
| `MAP_PROVIDER` | `osrm` | `osrm` · `mapbox` · `google` · `here` |
| `MAP_ROUTING_URL` | OSRM public | Routing engine base URL |
| `MAP_GEOCODE_URL` | Nominatim | Geocoding base URL |
| `OTP_TTL_SECONDS` | `300` | OTP expiry |
| `BCRYPT_ROUNDS` | `10` | Password hashing cost |
| `RATE_LIMIT_MAX` | `300` | Requests per 15 min window |
| `AUTH_RATE_LIMIT_MAX` | `10` | Auth requests per 15 min window |

---

## User Roles

| Role | Capabilities |
|---|---|
| **STUDENT** | Book rides, view active trip, manage guardians, earn points, redeem rewards, trigger SOS |
| **PARENT** | Monitor child's active trip live, view trip history, receive notifications, file safety reports |
| **DRIVER** | Accept/decline rides, verify pickup PIN, update live location, complete trips |
| **ADMIN** | Full platform access — user management, driver verification, ride oversight, system config |

---

## Ride Lifecycle

```
REQUESTED → DRIVER_ASSIGNED → DRIVER_ARRIVED → PIN_VERIFIED → IN_PROGRESS → COMPLETED
                                                                           ↘ CANCELLED / NO_SHOW
```

1. Student (or parent) books a ride and selects a verified driver
2. Driver accepts → status moves to `DRIVER_ASSIGNED`
3. Driver arrives at pickup → `DRIVER_ARRIVED`
4. Driver enters the student's PIN → `PIN_VERIFIED`
5. Driver starts the trip → `IN_PROGRESS` (live location sharing begins)
6. Driver marks arrival → `COMPLETED` (1 Guardian Point awarded)

---

## Production Deployment

1. Set `NODE_ENV=production` and a strong `AUTH_SECRET`
2. Run `npm run build` to compile TypeScript and bundle the frontend
3. Run `npm run db:deploy` (instead of `db:migrate`) to apply migrations without prompts
4. Serve the compiled API with `npm run start`
5. Serve `web/dist` from a static host or reverse proxy (Nginx, Caddy, etc.)
6. Point `CORS_ORIGINS` to your production frontend domain
7. Configure `SMS_PROVIDER=twilio` with real credentials for OTP delivery

---

## License

Private — Guardian Transit. All rights reserved.
