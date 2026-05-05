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

## 1. Architecture Overview

```mermaid
graph TD
    API[NestJS API Gateway] --> Auth[Auth Module]
    API --> WF[Workflow Engine]
    WF --> Queue[BullMQ / Redis]
    Queue --> Workers[Worker Nodes]
    Workers --> ES[(Elasticsearch Logs)]
    Workers --> DB[(PostgreSQL)]
    API --> Sockets[WebSocket / Socket.io]
    Workers -.->|Status Updates| Sockets
```

- **NestJS modular architecture**: Provides strict separation of concerns, dependency injection, and clean module boundaries.
- **BullMQ/Redis job queue**: Ensures workflows run reliably. Jobs can be retried, paused, and distributed across multiple worker nodes.
- **Elasticsearch**: Used for execution logs. *Justification: Execution logs are high-volume, append-only, and require fast full-text search. Storing them in the primary PostgreSQL database would cause unnecessary bloat and degrade core system performance.*
- **WebSocket (Socket.io)**: Pushes real-time workflow status updates and live execution logs to the frontend dashboard.
- **Prisma ORM with PostgreSQL**: Provides strong typing for relational data (Organizations, Workflows, Runs, Users).

## 2. Role-Based Access Control (RBAC)

Access is scoped per Organization.

- **OWNER**: Full control (Admin). Can delete the organization, manage billing, and has all ADMIN privileges.
- **ADMIN**: Editor. Can create, edit, update, and delete workflows. Can invite members.
- **MEMBER**: Viewer. Read-only access to workflows and runs. Can manually trigger workflow runs but cannot modify definitions.

## 3. Query Optimization (EXPLAIN Plan)

### The Query (Recent Hourly Runs for Dashboard)
```sql
SELECT * FROM "WorkflowRun" 
WHERE "organizationId" = $1 AND "startedAt" >= NOW() - INTERVAL '1 hour' 
ORDER BY "startedAt" DESC 
LIMIT 50;
```

### Representative EXPLAIN ANALYZE Output
```
Limit  (cost=0.29..4.81 rows=50 width=218) (actual time=0.015..0.021 rows=50 loops=1)
  ->  Index Scan Backward using idx_workflowrun_org_started on "WorkflowRun"  (cost=0.29..418.25 rows=4629 width=218) (actual time=0.013..0.018 rows=50 loops=1)
        Index Cond: ("organizationId" = 'org_123'::text AND "startedAt" >= (now() - '01:00:00'::interval))
Planning Time: 0.125 ms
Execution Time: 0.035 ms
```

### Index Strategy Reasoning
A compound index `(organizationId, startedAt DESC)` ensures that PostgreSQL can filter by organization and immediately retrieve the most recent rows without an expensive in-memory sort or sequential scan.

## 4. Trade-Offs & Decisions

- **BullMQ vs In-Process Execution**: We chose BullMQ (Redis) to allow the execution engine to scale horizontally independently of the API servers, and to survive API server crashes without dropping workflow runs. The trade-off is the added operational complexity of maintaining Redis.
- **Elasticsearch vs DB for Logs**: Storing logs in Elasticsearch prevents the primary PostgreSQL database from ballooning in size. The trade-off is eventual consistency for logs and requiring another infrastructure component.
- **Layer-based Parallel Execution**: We group DAG nodes into topological layers and execute nodes in the same layer concurrently using `Promise.all`. This provides maximum parallel throughput but means a single slow node in a layer blocks the next layer from starting.
- **Soft Deletes for Workflows**: Workflows are soft-deleted to maintain referential integrity for historical `WorkflowRun` records.

## 5. What Would I Improve

Given more time, I would implement:
- **Event Sourcing for Audit Trail**: Keep a robust, replayable ledger of who changed what workflow and when.
- **Distributed Tracing**: Integrate OpenTelemetry to trace execution across the API, Redis queue, and Workers.
- **GraphQL API**: Offer a GraphQL endpoint to allow the frontend to fetch exactly the data it needs, reducing payload sizes.
- **Workflow Templates & Marketplace**: Allow users to share workflows across organizations.

## 6. AI Prompt Engineering

For AI workflow generation, the prompt strategy involves:
1. **System Context**: Defining the engine capabilities, available node types (HTTP, Script, Delay, Conditional), and strict JSON schema requirements.
2. **Few-Shot Examples**: Providing examples of natural language requests mapped to valid DAG JSON structures.
3. **Validation Loop**: Programmatically validating the AI output (e.g., checking for cycles, dangling edges) and re-prompting the model with error logs if the output is invalid.