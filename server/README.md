# Audio-Press AI Server

Remote API server for the Audio-Press AI WordPress plugin. Handles license validation, metering, and audio generation.

## Features

- ✅ Freemius license validation
- ✅ Monthly character metering (200K characters)
- ✅ Generate count tracking (how many times user clicked Generate Audio)
- ✅ OpenAI TTS proxy
- ✅ S3 storage for audio files
- ✅ Usage tracking and reporting
- ✅ Admin statistics endpoint

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

**Required Environment Variables:**
- `FREEMIUS_DEVELOPER_ID` - Your Freemius developer ID
- `FREEMIUS_PUBLIC_KEY` - Your Freemius public key
- `FREEMIUS_SECRET_KEY` - Your Freemius secret key
- `FREEMIUS_PLUGIN_ID` - Your Freemius plugin ID
- `OPENAI_API_KEY` - Your OpenAI API key
- `AWS_ACCESS_KEY_ID` - AWS access key for S3
- `AWS_SECRET_ACCESS_KEY` - AWS secret key for S3
- `AWS_REGION` - AWS region (e.g., us-east-1)
- `AWS_S3_BUCKET` - S3 bucket name
- `AWS_S3_URL_PREFIX` - S3 URL prefix (optional)
- `ADMIN_KEY` - Secret key for admin endpoints (optional)

### 3. Run Server

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

## API Endpoints

### POST /generate

Generate audio from text.

**Request:**
```json
{
  "license_key": "license_key_from_freemius",
  "text": "Text to convert to audio",
  "model": "tts-1-hd",
  "voice": "nova"
}
```

**Response:**
```json
{
  "success": true,
  "audio_url": "https://bucket.s3.amazonaws.com/audio/file.mp3",
  "usage": {
    "used": 15000,
    "limit": 200000,
    "remaining": 185000,
    "this_request": 5000,
    "generate_count": 12
  }
}
```

**Note:** `generate_count` shows how many times this user has clicked "Generate Audio" this month.

### POST /usage

Check license usage.

**Request:**
```json
{
  "license_key": "license_key_from_freemius"
}
```

**Response:**
```json
{
  "month": "2025-01",
  "used": 15000,
  "limit": 200000,
  "remaining": 185000,
  "percentage": "7.50",
  "generate_count": 12
}
```

### GET /admin/stats

Get statistics for all users (requires admin key).

**Headers:**
```
x-admin-key: your_admin_key_here
```

**Response:**
```json
{
  "month": "2025-01",
  "total_users": 25,
  "total_generates": 342,
  "stats": [
    {
      "license_key": "abc12345...",
      "month": "2025-01",
      "chars_used": 45000,
      "generate_count": 45,
      "remaining": 155000
    },
    ...
  ]
}
```

**Note:** Stats are sorted by `generate_count` descending.

### GET /health

Health check endpoint.

## Usage Tracking

The server tracks two metrics per user (per month):

1. **Character Usage** - Total characters processed (limited to 200K/month)
2. **Generate Count** - Number of times user clicked "Generate Audio"

Both counters reset on the 1st of each month.

## Deployment

### Recommended Platforms:

1. **Heroku** - Easy deployment
2. **AWS EC2** - Full control
3. **DigitalOcean** - Simple setup
4. **Railway** - Modern platform

### Production Considerations:

- Use **Redis** or **PostgreSQL** for metering instead of in-memory Map
- Add **rate limiting** (express-rate-limit)
- Add **proper authentication** for admin endpoints
- Set up **logging** (Winston, Pino)
- Configure **HTTPS** (Let's Encrypt)
- Set up **monitoring** (PM2, Sentry)

## Database Migration (Production)

For production, replace the in-memory `Map` with a proper database:

```javascript
// Example with PostgreSQL
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function checkAndUpdateUsage(licenseKey, textLength) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    const result = await pool.query(
        `INSERT INTO usage (license_key, month, chars_used, generate_count)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (license_key, month)
         DO UPDATE SET 
           chars_used = usage.chars_used + $3,
           generate_count = usage.generate_count + 1
         RETURNING *`,
        [licenseKey, currentMonth, textLength]
    );
    
    // Check limit...
}

async function incrementGenerateCount(licenseKey) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    const result = await pool.query(
        `INSERT INTO usage (license_key, month, chars_used, generate_count)
         VALUES ($1, $2, 0, 1)
         ON CONFLICT (license_key, month)
         DO UPDATE SET generate_count = usage.generate_count + 1
         RETURNING generate_count`,
        [licenseKey, currentMonth]
    );
    
    return result.rows[0].generate_count;
}
```

**SQL Schema:**
```sql
CREATE TABLE usage (
    license_key VARCHAR(255) NOT NULL,
    month VARCHAR(7) NOT NULL,
    chars_used INTEGER DEFAULT 0,
    generate_count INTEGER DEFAULT 0,
    PRIMARY KEY (license_key, month),
    INDEX idx_month (month),
    INDEX idx_generate_count (generate_count)
);
```

## License

Proprietary - All rights reserved.
