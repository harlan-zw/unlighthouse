# Deployment Guide

This guide covers deploying the Cloud Unlighthouse API to production.

## Prerequisites

- Node.js 20+
- SQLite database (included)
- Browserless.io account (or self-hosted Browserless)

## Environment Variables

**Required:**
```bash
NUXT_BROWSERLESS_TOKEN=your-browserless-token
```

**Optional:**
```bash
DATABASE_DIR=/path/to/data
NUXT_BROWSERLESS_URL=https://chrome.browserless.io
NODE_ENV=production
```

## Deployment Options

### Option 1: Docker (Recommended)

#### Build and Run

```bash
# Build image
docker build -t cloud-unlighthouse .

# Run container
docker run -d \
  -p 3000:3000 \
  -e NUXT_BROWSERLESS_TOKEN=your-token \
  -v $(pwd)/data:/app/data \
  --name cloud-unlighthouse \
  cloud-unlighthouse
```

#### Using Docker Compose

```bash
# Create .env file
echo "NUXT_BROWSERLESS_TOKEN=your-token" > .env

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

**Features:**
- ✅ Automatic restarts
- ✅ Health checks
- ✅ Persistent database (volume mount)
- ✅ Non-root user for security

### Option 2: Node.js Directly

```bash
# Install dependencies
pnpm install --prod

# Build
pnpm build

# Set environment
export NUXT_BROWSERLESS_TOKEN=your-token
export NODE_ENV=production

# Start
node .output/server/index.mjs
```

### Option 3: PM2 (Process Manager)

```bash
# Install PM2
npm install -g pm2

# Build
pnpm build

# Start with PM2
pm2 start .output/server/index.mjs \
  --name cloud-unlighthouse \
  --env production

# Save PM2 configuration
pm2 save

# Setup auto-restart on server reboot
pm2 startup
```

**PM2 Features:**
- Auto-restart on failure
- Log management
- Load balancing (cluster mode)
- Monitoring

### Option 4: Platform Deployments

#### Vercel/Netlify

Not recommended - Lighthouse scans need long-running processes (>10s) which exceeds serverless limits.

#### Railway/Render

```bash
# Connect repository
# Set environment variables in dashboard
# Deploy automatically on push
```

#### DigitalOcean App Platform

```yaml
# app.yaml
name: cloud-unlighthouse
services:
  - name: api
    source_dir: /
    build_command: pnpm install && pnpm build
    run_command: node .output/server/index.mjs
    envs:
      - key: NUXT_BROWSERLESS_TOKEN
        value: ${NUXT_BROWSERLESS_TOKEN}
      - key: NODE_ENV
        value: production
    health_check:
      http_path: /api/health
```

#### Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Launch app
fly launch

# Deploy
fly deploy
```

## Production Checklist

### Security

- [x] Rate limiting enabled (5 user creations/hour, 100 scans/hour per user)
- [ ] Configure CORS in nuxt.config.ts
- [ ] Set up HTTPS (via reverse proxy or platform)
- [ ] Use secrets manager for NUXT_BROWSERLESS_TOKEN
- [ ] Implement API key rotation strategy
- [ ] Add request size limits

### Database

- [x] Auto-migrations on startup
- [x] WAL mode enabled for concurrent access
- [ ] Regular backups configured
- [ ] Retention policy for old scans
- [ ] Monitor database size

### Monitoring

- [x] Health check endpoint (/api/health)
- [x] Metrics endpoint (/api/metrics)
- [ ] Set up uptime monitoring (UptimeRobot, Better Uptime)
- [ ] Configure error tracking (Sentry)
- [ ] Set up logging aggregation (LogDNA, Papertrail)
- [ ] Monitor Browserless usage/costs

### Performance

- [x] Result caching enabled
- [x] Request queuing
- [ ] CDN for static assets
- [ ] Database query optimization
- [ ] Consider Redis for distributed caching (multi-instance)

### Scaling

**Single Server:**
- Current setup handles ~1000 scans/day
- Browserless manages browser scaling
- SQLite sufficient for read-heavy workloads

**Multiple Servers:**
- Add Redis for shared cache
- Add Redis for rate limiting
- Consider PostgreSQL for better concurrency
- Use sticky sessions or consistent hashing

## Reverse Proxy Setup

### Nginx

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Caddy

```caddyfile
your-domain.com {
    reverse_proxy localhost:3000
}
```

## Database Backups

### Automated Backup Script

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"
DB_PATH="/app/data/lighthouse.db"

# Create backup
sqlite3 $DB_PATH ".backup '$BACKUP_DIR/lighthouse_$DATE.db'"

# Compress
gzip "$BACKUP_DIR/lighthouse_$DATE.db"

# Delete backups older than 30 days
find $BACKUP_DIR -name "lighthouse_*.db.gz" -mtime +30 -delete

echo "Backup completed: lighthouse_$DATE.db.gz"
```

### Cron Job

```bash
# Run daily at 2 AM
0 2 * * * /path/to/backup.sh
```

## Maintenance

### Database Cleanup

Remove old scans (>90 days):

```bash
curl -X POST http://localhost:3000/api/admin/cleanup \
  -H "Authorization: Bearer admin-key" \
  -d '{"olderThan": 90}'
```

Or directly in SQLite:

```sql
DELETE FROM scans
WHERE created_at < unixepoch('now', '-90 days');

-- Optimize database
VACUUM;
```

### Update Deployment

```bash
# Pull latest code
git pull

# Install dependencies
pnpm install

# Build
pnpm build

# Restart (Docker Compose)
docker-compose restart

# Or PM2
pm2 restart cloud-unlighthouse
```

## Monitoring Endpoints

### Health Check

```bash
GET /api/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-10T...",
  "checks": {
    "chromePool": {"status": "pass"},
    "queue": {"status": "pass"}
  }
}
```

### Metrics

```bash
GET /api/metrics
# or /api/metrics-browserless for Browserless endpoint
```

Response includes queue depth, cache hit rate, processing times.

## Troubleshooting

### High Memory Usage

- Check Chrome pool size (reduce NUXT_LIGHTHOUSE_MAX_CHROME_INSTANCES)
- Monitor cache size
- Review database size
- Check for memory leaks in logs

### Slow Scans

- Check Browserless account limits
- Review queue depth
- Monitor network latency
- Check Browserless service status

### Database Locked

- WAL mode should prevent this
- Check for long-running transactions
- Ensure proper connection cleanup

### Rate Limit Too Restrictive

Edit `/server/api/users/create.post.ts` or `/server/api/scan-browserless.post.ts`:

```typescript
rateLimit({
  limit: 200, // Increase from 100
  windowMs: 60 * 60 * 1000,
})
```

## Cost Optimization

### Browserless Usage

- Use caching (already enabled)
- Set appropriate maxConcurrency
- Monitor usage in Browserless dashboard
- Consider self-hosted Browserless for high volume

### Hosting Costs

- **Small**: $5-10/month (Fly.io, Railway)
- **Medium**: $20-50/month (DigitalOcean, Render)
- **Large**: $100+/month (dedicated VPS)

Plus Browserless costs ($30-150/month)

## Security Hardening

### 1. API Key Security

- Store in secrets manager (AWS Secrets Manager, Vault)
- Rotate regularly
- Use different keys for dev/staging/production

### 2. Network Security

- Use firewall rules
- Whitelist IP addresses if possible
- Enable DDoS protection (Cloudflare)

### 3. Input Validation

- Already implemented in endpoints
- Consider adding URL allowlist/blocklist
- Sanitize all user inputs

### 4. HTTPS

Always use HTTPS in production:

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  // Force HTTPS redirects
  routeRules: {
    '/**': {
      headers: {
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      },
    },
  },
})
```

## Support

For issues:
1. Check logs: `docker-compose logs -f` or `pm2 logs`
2. Review metrics: `GET /api/metrics`
3. Check health: `GET /api/health`
4. Verify environment variables
5. Test Browserless connectivity

For Browserless issues:
- Check dashboard: https://dashboard.browserless.io
- Review API limits
- Test endpoint: https://chrome.browserless.io/performance

## Summary

**Minimal Production Setup:**
1. Docker + Docker Compose
2. Set NUXT_BROWSERLESS_TOKEN
3. Mount volume for database persistence
4. Configure domain + HTTPS
5. Set up monitoring

**Recommended Production Setup:**
1. All of minimal setup
2. Reverse proxy (Nginx/Caddy)
3. Automated backups
4. Error tracking (Sentry)
5. Uptime monitoring
6. Log aggregation
