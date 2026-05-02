# Flowforge Backend

This is the robust backend orchestration engine for Flowforge, built with NestJS, Prisma ORM, BullMQ, Redis, and PostgreSQL.

## Prerequisites

To run the backend, you need the following dependencies installed on your machine:

- **Node.js** (v20 or higher)
- **npm** (v10 or higher)
- **PostgreSQL** (v15 or higher) - *If running locally without Docker*
- **Redis** (v7 or higher) - *If running locally without Docker*
- **Docker & Docker Compose** - *(Recommended for easiest setup)*

---

## Setup & Running via Docker (Recommended)

The easiest way to get the entire backend environment (including PostgreSQL, Redis, and the Node.js server) up and running is via Docker.

1. Navigate to the **flowforge-backend** directory.
   ```bash
   cd flowforge-backend
   ```
2. Start the services:
   ```bash
   docker-compose up -d --build
   ```
3. The backend will automatically apply Prisma migrations on startup and will be available at [http://localhost:3000](http://localhost:3000).

---

## Local Development Setup (Without Docker)

If you wish to run the Node.js application natively on your machine for active development, follow these steps:

### 1. Database & Cache Preparation
You must have instances of **PostgreSQL** and **Redis** running locally.
Alternatively, you can spin up *only* the databases using Docker:
```bash
# From the root directory, run only postgres and redis
docker-compose up -d postgres redis
```

### 2. Configure Environment Variables
Ensure the `.env` file in the `flowforge-backend` directory is properly configured:
```env
# Change localhost if your DB/Redis is hosted elsewhere
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/flowforge?schema=public"
REDIS_HOST="localhost"
REDIS_PORT=6379
JWT_SECRET="super-secret-jwt-key"
JWT_EXPIRATION="1d"
PORT=3000
```

### 3. Install Dependencies
```bash
cd flowforge-backend
npm install
```

### 4. Database Migrations (Prisma)
Before starting the app, you must apply the database schema.
```bash
# Push the schema to the database (creates tables)
npx prisma db push

# OR, if you want to create migration histories:
npx prisma migrate dev --name init
```
*(If you need to view the data, you can run `npx prisma studio` to open a local DB GUI).*

### 5. Start the Application
```bash
# Development mode (with auto-reload)
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

## Key Technologies Used
- **NestJS**: Core framework
- **Prisma**: Type-safe Database ORM
- **BullMQ**: Reliable Redis-based job queues for DAG execution
- **Socket.io**: Real-time websocket gateway for workflow status updates
