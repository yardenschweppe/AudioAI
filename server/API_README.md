# Audio-Press AI Server - API Documentation

## Overview

Audio-Press AI Server is a Node.js API server that handles text-to-speech audio generation with usage tracking based on WordPress post IDs. It integrates with Freemius for license management and uses Piper TTS for audio synthesis.

---

## 📊 Database Schema

### Table: `audio_press_usage`

Stores usage data per license key per month.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT AUTO_INCREMENT | Primary key |
| `license_key` | VARCHAR(255) | Freemius license key (unique per month) |
| `month` | VARCHAR(7) | Month in format YYYY-MM |
| `posts_used` | JSON | Array of post IDs that were processed |
| `trial_post_id` | VARCHAR(255) | First post ID used (trial users only) |
| `generate_count` | INT | Total number of audio generations |
| `chars_used` | BIGINT | Total characters processed (statistics only) |
| `plan` | VARCHAR(50) | Plan name (trial/starter/creator/pro/agency/unlimited) |
| `created_at` | TIMESTAMP | Record creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

**Indexes:**
- `UNIQUE KEY license_month (license_key, month)` - Ensures one record per license per month
- `KEY idx_license_key (license_key)` - Fast lookup by license
- `KEY idx_month (month)` - Fast lookup by month

**SQL to Create:**
```sql
CREATE TABLE IF NOT EXISTS `audio_press_usage` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `license_key` VARCHAR(255) NOT NULL,
    `month` VARCHAR(7) NOT NULL,
    `posts_used` JSON NOT NULL,
    `trial_post_id` VARCHAR(255) DEFAULT NULL,
    `generate_count` INT DEFAULT 0,
    `chars_used` BIGINT DEFAULT 0,
    `plan` VARCHAR(50) DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `license_month` (`license_key`, `month`),
    KEY `idx_license_key` (`license_key`),
    KEY `idx_month` (`month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 🔌 API Endpoints

### Base URL
```
http://localhost:3004
```

### 1. POST `/generate`

Generate audio from text for a specific WordPress post.

**Request Body:**
```json
{
  "text": "Text to convert to audio",
  "post_id": "123",
  "license_key": "your_freemius_license_key",
  "language": "en"  // Optional: hint for language detection
}
```

**Success Response (200):**
```json
{
  "ok": true,
  "language": "en",
  "audio_data": "base64_encoded_audio_data",
  "audio_mime": "audio/wav",
  "filename": "audio_1234567890.wav",
  "usage": {
    "plan": "starter",
    "used_posts": 5,
    "limit_posts": 50,
    "remaining_posts": 45,
    "generate_count": 12
  }
}
```

**Error Responses:**
- `400` - Missing required fields (`license_key`, `text`, or `post_id`)
- `402` - Trial limit exceeded (only first post allowed for trial users)
- `403` - Invalid or expired license
- `429` - Monthly post limit exceeded OR rate limit exceeded (too many requests)

**Example:**
```bash
curl -X POST http://localhost:3004/generate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world",
    "post_id": "123",
    "license_key": "abc123..."
  }'
```

**Notes:**
- Each unique `post_id` counts once per month (repeated generations don't count again)
- Trial users can only use their first post (any number of times)
- Paid plans have monthly post limits (configured via `PLAN_LIMIT_*` env vars)
- Rate limit: 6 requests per minute per license
- Long texts (>3000 chars) are automatically split and merged into one WAV file

---

### 2. POST `/usage`

Check current usage for a license key.

**Request Body:**
```json
{
  "license_key": "your_freemius_license_key"
}
```

**Success Response (200):**
```json
{
  "month": "2025-01",
  "plan": "starter",
  "used_posts": 5,
  "limit_posts": 50,
  "remaining_posts": 45,
  "generate_count": 12,
  "trial_post_id": null
}
```

**Error Responses:**
- `400` - Missing `license_key`
- `403` - Invalid or expired license

**Example:**
```bash
curl -X POST http://localhost:3004/usage \
  -H "Content-Type: application/json" \
  -d '{"license_key": "abc123..."}'
```

---

### 3. POST `/detect-language`

Detect the language of given text.

**Request Body:**
```json
{
  "text": "Text to detect language for",
  "langHint": "en"  // Optional: hint language code
}
```

**Success Response (200):**
```json
{
  "detected": "en",
  "languageName": "English",
  "available": [
    {
      "code": "en",
      "name": "English",
      "isDetected": true
    },
    {
      "code": "es",
      "name": "Español (Spanish)",
      "isDetected": false
    }
    // ... more languages
  ]
}
```

**Example:**
```bash
curl -X POST http://localhost:3004/detect-language \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world"}'
```

---

### 4. GET `/health`

Health check endpoint.

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "test_mode": false,
  "note": "Audio files are stored directly in WordPress media library"
}
```

**Example:**
```bash
curl http://localhost:3004/health
```

---

### 5. GET `/admin/stats`

Get statistics for all users (admin only).

**Headers:**
```
x-admin-key: your_admin_key_here
```

**Success Response (200):**
```json
{
  "month": "2025-01",
  "total_users": 25,
  "total_generates": 342,
  "stats": [
    {
      "license_key": "abc12345...",
      "month": "2025-01",
      "posts_used": 12,
      "generate_count": 45,
      "trial_post_id": null,
      "chars_used": 45000,
      "plan": "starter"
    }
    // ... more users
  ]
}
```

**Note:** Stats are sorted by `generate_count` descending.

**Example:**
```bash
curl -X GET http://localhost:3004/admin/stats \
  -H "x-admin-key: your_admin_key"
```

---

### 6. POST `/admin/setup-database`

Initialize database tables (admin only).

**Headers:**
```
x-admin-key: your_admin_key_here
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Database initialized successfully",
  "table": "audio_press_usage",
  "database": "audio_press_ai",
  "host": "localhost"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Database initialization failed",
  "details": "...",
  "config": {
    "host": "localhost",
    "user": "audio",
    "database": "audio_press_ai",
    "has_password": true
  },
  "solutions": [
    "1. Ensure MySQL is running: systemctl status mysql",
    "2. Verify credentials in .env file",
    "3. Create database manually: CREATE DATABASE `audio_press_ai`;",
    "4. Grant privileges: GRANT ALL ON `audio_press_ai`.* TO 'audio'@'localhost';"
  ]
}
```

**Example:**
```bash
curl -X POST http://localhost:3004/admin/setup-database \
  -H "x-admin-key:Yarden"
```

---

### 7. GET `/admin/database-status`

Check database connection status (admin only).

**Headers:**
```
x-admin-key: your_admin_key_here
```

**Success Response (200):**
```json
{
  "connected": true,
  "table_exists": true,
  "table": "audio_press_usage",
  "database": "audio_press_ai",
  "columns": [
    {
      "name": "id",
      "type": "int",
      "null": "NO",
      "key": "PRI",
      "default": null
    }
    // ... more columns
  ],
  "record_count": 42
}
```

**Example:**
```bash
curl -X GET http://localhost:3004/admin/database-status \
  -H "x-admin-key: your_admin_key"
```

---

## 📋 Plan Limits

Configured via environment variables (defaults shown):

| Plan | Default Limit | Env Variable |
|------|---------------|--------------|
| trial | 1 post | `PLAN_LIMIT_TRIAL` |
| starter | 50 posts/month | `PLAN_LIMIT_STARTER` |
| creator | 150 posts/month | `PLAN_LIMIT_CREATOR` |
| pro | 500 posts/month | `PLAN_LIMIT_PRO` |
| agency | 2000 posts/month | `PLAN_LIMIT_AGENCY` |
| unlimited | ∞ (no limit) | - |

---

## ⚙️ Server Limits

| Limit | Default | Env Variable | Description |
|-------|---------|--------------|-------------|
| **MAX_CONCURRENCY** | 2 | `MAX_CONCURRENCY` | Max parallel audio generation jobs |
| **QUEUE_MAX** | 20 | `QUEUE_MAX` | Max queued jobs |
| **JOB_TIMEOUT_MS** | 600000 (10 min) | `JOB_TIMEOUT_MS` | Max time per job |
| **RATE_LIMIT** | 6/min | `RATE_LIMIT_PER_LICENSE_PER_MIN` | Requests per minute per license |
| **SPLIT_THRESHOLD** | 3000 chars | `MAX_CHARS_SPLIT_THRESHOLD` | Auto-split long texts |

---

## 🔒 Authentication

- **Public endpoints:** `/generate`, `/usage`, `/detect-language`, `/health`
- **Admin endpoints:** Require `x-admin-key` header matching `ADMIN_KEY` env variable

---

## 📝 Usage Model

### Trial Users:
- First post is free and can be regenerated unlimited times
- Any other post → `402` error

### Paid Plans:
- Monthly post limit (based on plan)
- Each unique `post_id` counts once per month
- Regenerating same post doesn't consume additional quota

### Example:
```
User with "starter" plan (50 posts/month):
- Post 123 → ✅ (1/50 used)
- Post 123 again → ✅ (still 1/50, no additional cost)
- Post 456 → ✅ (2/50 used)
- ... 48 more unique posts → ✅ (50/50 used)
- Post 789 → ❌ 429 (limit exceeded)
```

---

## 🗄️ Database Usage

The server uses MySQL for persistent storage:
- **In-memory cache** for fast access
- **Database** for persistence across restarts
- Automatic fallback to memory-only if DB unavailable

### Database Setup:

1. **Create database:**
```sql
CREATE DATABASE `audio_press_ai` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. **Create user and grant privileges:**
```sql
CREATE USER IF NOT EXISTS 'audio'@'localhost' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON `audio_press_ai`.* TO 'audio'@'localhost';
FLUSH PRIVILEGES;
```

3. **Configure .env:**
```env
DB_HOST=localhost
DB_USER=audio
DB_PASSWORD=password
DB_NAME=audio_press_ai
DB_TABLE_NAME=audio_press_usage
```

4. **Initialize tables:**
```bash
curl -X POST http://localhost:3004/admin/setup-database \
  -H "x-admin-key: your_admin_key"
```

---

## 🚨 Error Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `400` | Bad request (missing/invalid parameters) |
| `401` | Unauthorized (admin key missing/wrong) |
| `402` | Payment required (trial limit exceeded) |
| `403` | Forbidden (invalid/expired license) |
| `429` | Too many requests (rate limit or monthly limit exceeded) |
| `500` | Internal server error |

---

## 📦 Dependencies

- `express` - Web server
- `mysql2` - MySQL client
- `axios` - HTTP client (Freemius API)
- `franc` - Language detection
- `cors` - CORS middleware
- `dotenv` - Environment variables

---

## 🔧 Environment Variables

See `.env.example` for full list. Key variables:

```env
# Server
PORT=3004
TEST_MODE=false
ADMIN_KEY=your_secret_key

# Database
DB_HOST=localhost
DB_USER=audio
DB_PASSWORD=password
DB_NAME=audio_press_ai

# Freemius
FREEMIUS_DEVELOPER_ID=12345
FREEMIUS_PUBLIC_KEY=pk_...
FREEMIUS_SECRET_KEY=sk_...
FREEMIUS_PLUGIN_ID=12345

# Plan Limits
PLAN_LIMIT_TRIAL=1
PLAN_LIMIT_STARTER=50
PLAN_LIMIT_CREATOR=150
PLAN_LIMIT_PRO=500
PLAN_LIMIT_AGENCY=2000

# Server Limits
MAX_CONCURRENCY=2
QUEUE_MAX=20
JOB_TIMEOUT_MS=600000
RATE_LIMIT_PER_LICENSE_PER_MIN=6
MAX_CHARS_SPLIT_THRESHOLD=3000
```

---

## 📚 Additional Notes

- **Text Splitting:** Long texts (>3000 chars) are automatically split into two parts, processed separately, and merged into one WAV file using ffmpeg
- **Language Detection:** Uses `franc` library for automatic language detection
- **Supported Languages:** EN, ES, PT-PT, PT-BR, DE, NL-NL, NL-BE (commercial CC0 models)
- **Hebrew:** Not supported (no commercial model available)

