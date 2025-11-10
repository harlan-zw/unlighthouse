# Database Setup with Drizzle ORM

This API uses SQLite with Drizzle ORM to track users and their scan history.

## Schema

### Users Table
Stores API users who can run scans:
- `id` - Auto-increment primary key
- `email` - Unique email address
- `name` - Optional display name
- `apiKey` - Unique API key for authentication (format: `lh_...`)
- `createdAt` / `updatedAt` - Timestamps

### Scans Table
Stores all Lighthouse scan requests and results:
- `id` - Auto-increment primary key
- `userId` - Foreign key to users table
- `url` - URL that was scanned
- `categories` - JSON array of Lighthouse categories
- `formFactor` - mobile or desktop
- `throttling` - mobile3G, mobile4G, or none
- `status` - queued, processing, completed, failed, or cached
- `result` - Full JSON result from Lighthouse
- `performanceScore` / `accessibilityScore` / `bestPracticesScore` / `seoScore` - Individual scores (0-100)
- `cached` - Boolean if result came from cache
- `endpoint` - Which endpoint was used (self-hosted or browserless)
- `createdAt` / `startedAt` / `completedAt` - Timestamps

## Database Location

By default: `./data/lighthouse.db`

Override with environment variable:
```bash
DATABASE_DIR=/path/to/data
# or
DATABASE_URL=/path/to/custom/database.db
```

## Initial Setup

1. **Install dependencies:**
```bash
pnpm install
```

2. **Run migrations:**
The database will be automatically created and migrated on first request.

Alternatively, generate and apply migrations manually:
```bash
# Generate migration files
pnpm db:generate

# Apply migrations (done automatically on startup)
pnpm db:migrate
```

3. **Create first user:**
```bash
curl -X POST http://localhost:3000/api/users/create \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "name": "John Doe"}'
```

Response:
```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "John Doe",
  "apiKey": "lh_abc123...",
  "createdAt": "2025-11-10T..."
}
```

**Save the API key!** You'll need it for all scan requests.

## Using the API

### Authentication

All scan and history endpoints require authentication via API key:

```bash
# Option 1: Authorization header
curl -H "Authorization: Bearer lh_abc123..." \
  http://localhost:3000/api/scans/history

# Option 2: X-API-Key header
curl -H "X-API-Key: lh_abc123..." \
  http://localhost:3000/api/scans/history
```

### Run a Scan

```bash
curl -X POST http://localhost:3000/api/scan-browserless \
  -H "Authorization: Bearer lh_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "categories": ["performance", "accessibility"],
    "formFactor": "mobile"
  }'
```

Response includes `scanId` for tracking:
```json
{
  "url": "https://example.com",
  "categories": {...},
  "audits": {...},
  "scanId": 42
}
```

### Get Scan History

```bash
# Get all scans for authenticated user
curl -H "Authorization: Bearer lh_abc123..." \
  "http://localhost:3000/api/scans/history?limit=50&offset=0"

# Filter by status
curl -H "Authorization: Bearer lh_abc123..." \
  "http://localhost:3000/api/scans/history?status=completed"
```

### Get Specific Scan

```bash
curl -H "Authorization: Bearer lh_abc123..." \
  http://localhost:3000/api/scans/42
```

Returns full scan details including complete Lighthouse result.

### Get Current User Info

```bash
curl -H "Authorization: Bearer lh_abc123..." \
  http://localhost:3000/api/users/me
```

## Database Studio

Drizzle Kit includes a web UI for browsing the database:

```bash
pnpm db:studio
```

Opens at `https://local.drizzle.studio`

## Schema Changes

When modifying `server/database/schema.ts`:

1. **Generate migration:**
```bash
pnpm db:generate
```

This creates SQL migration files in `server/database/migrations/`

2. **Review migration:**
Check the generated SQL in the migrations folder

3. **Apply migration:**
Restart the server (migrations run automatically on startup)

Or manually:
```bash
pnpm db:migrate
```

## Backup

SQLite makes backups simple:

```bash
# Backup database
cp data/lighthouse.db data/lighthouse.db.backup

# Or use SQLite backup command
sqlite3 data/lighthouse.db ".backup data/lighthouse.db.backup"
```

## Production Considerations

### 1. WAL Mode (Enabled by Default)

The database uses Write-Ahead Logging for better concurrent performance:
- Readers don't block writers
- Writers don't block readers
- Creates `.db-wal` and `.db-shm` files

### 2. Database Size

Monitor database size as scans accumulate:
```bash
du -h data/lighthouse.db
```

Consider cleanup strategies:
- Delete old scans (>90 days)
- Archive completed scans to cold storage
- Implement retention policies

```sql
-- Delete scans older than 90 days
DELETE FROM scans
WHERE created_at < unixepoch('now', '-90 days');
```

### 3. Performance

Indexes are created on:
- `scans.user_id` - Fast user scan lookups
- `scans.url` - Fast URL-based queries
- `scans.status` - Filter by status
- `scans.created_at` - Time-based queries

### 4. Scaling

SQLite works well for:
- Single server deployments
- Up to ~100K scans/day
- Read-heavy workloads

For larger scale, consider:
- PostgreSQL with Drizzle (change dialect in config)
- Read replicas for history queries
- Separate database per region

## API Endpoints Summary

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/users/create` | POST | No | Create new user & API key |
| `/api/users/me` | GET | Yes | Get current user info |
| `/api/scan-browserless` | POST | Yes | Run scan (saves to DB) |
| `/api/scans/history` | GET | Yes | Get user's scan history |
| `/api/scans/:id` | GET | Yes | Get specific scan details |

## Troubleshooting

### "Database is locked"

Increase timeout or check for long-running transactions:
```typescript
// In server/database/index.ts
sqlite.pragma('busy_timeout = 5000') // 5 seconds
```

### Missing API Key

All scan endpoints now require authentication. Create a user first:
```bash
POST /api/users/create
```

### Old Scans Not in Database

Only scans made after adding the database integration are tracked. Previous scans from cache/queue are not persisted.

### Migration Issues

Reset database and start fresh:
```bash
rm -rf data/
# Restart server - migrations run automatically
```
