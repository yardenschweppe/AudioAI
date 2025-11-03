const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
// franc is an ES Module, so we'll import it dynamically
let francModule = null;
async function getFranc() {
    if (!francModule) {
        francModule = await import('franc');
    }
    return francModule.franc || francModule.default || francModule;
}

// Load .env file (if exists)
const dotenvResult = require('dotenv').config();

// Log .env loading status
if (dotenvResult.error) {
    console.log('⚠️  .env file not found or error loading:', dotenvResult.error.message);
    console.log('   Using environment variables or default values');
} else {
    console.log('✅ .env file loaded successfully');
    console.log(`   Found ${Object.keys(dotenvResult.parsed || {}).length} environment variables`);
}

const app = express();
app.use(cors());
app.use(express.json());

// Database: MySQL (licenses, usage_month)
let mysql;
let dbPool = null;
try {
    mysql = require('mysql2/promise');
    const DB_HOST = process.env.DB_HOST;
    const DB_USER = process.env.DB_USER;
    const DB_PASSWORD = process.env.DB_PASSWORD;
    const DB_NAME = process.env.DB_NAME;
    const DB_PORT = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306;
    if (DB_HOST && DB_USER && DB_NAME) {
        dbPool = mysql.createPool({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASSWORD || '',
            database: DB_NAME,
            port: DB_PORT,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            dateStrings: true
        });
    }
} catch (e) {
    console.log('⚠️  mysql2 not installed; DB features disabled.');
}

async function initDatabase() {
    if (!dbPool) {
        console.log('⚠️  DB not configured. Set DB_HOST, DB_USER, DB_NAME in .env to enable persistent storage.');
        return;
    }
    const createLicenses = `
CREATE TABLE IF NOT EXISTS licenses (
  license_key      VARCHAR(128) PRIMARY KEY,
  plan_code        ENUM('trial','starter','creator','pro','agency','unlimited') NOT NULL DEFAULT 'trial',
  status           ENUM('trialing','active','past_due','canceled','expired') NOT NULL DEFAULT 'trialing',
  period           ENUM('monthly','yearly','lifetime') NOT NULL DEFAULT 'monthly',
  trial_post_id    BIGINT UNSIGNED NULL,
  is_test          TINYINT(1) NOT NULL DEFAULT 0,
  validated_at     DATETIME NULL,
  next_renewal_at  DATETIME NULL,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;

    const createUsageMonth = `
CREATE TABLE IF NOT EXISTS usage_month (
  license_key      VARCHAR(128) NOT NULL,
  month            CHAR(7)      NOT NULL,
  posts_used       JSON         NOT NULL DEFAULT (JSON_ARRAY()),
  posts_used_count INT UNSIGNED NOT NULL DEFAULT 0,
  generate_count   INT UNSIGNED NOT NULL DEFAULT 0,
  chars_used       BIGINT UNSIGNED NOT NULL DEFAULT 0,
  duration_sec     INT UNSIGNED NOT NULL DEFAULT 0,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (license_key, month),
  CONSTRAINT fk_usage_license FOREIGN KEY (license_key)
    REFERENCES licenses(license_key) ON DELETE CASCADE,
  KEY idx_month (month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;

    const conn = await dbPool.getConnection();
    try {
        await conn.query(createLicenses);
        await conn.query(createUsageMonth);
        console.log('✅ Database tables ensured (licenses, usage_month)');
    } finally {
        conn.release();
    }
}

// Configuration
// אפשר להגדיר ב-.env או בקוד (קודם מנסה .env, אחרת ערך ברירת מחדל)
const FREEMIUS_API_URL = 'https://api.freemius.com/v1/developers';
const FREEMIUS_DEVELOPER_ID = process.env.FREEMIUS_DEVELOPER_ID || 21493;
const FREEMIUS_PUBLIC_KEY = process.env.FREEMIUS_PUBLIC_KEY || 'pk_c1f4731e093f2279f624161d5ee8b';
const FREEMIUS_SECRET_KEY = process.env.FREEMIUS_SECRET_KEY || 'sk_0MMUBME@.WS)<IG1GLBsW(~w<0b)X';
const FREEMIUS_PLUGIN_ID = process.env.FREEMIUS_PLUGIN_ID || 21493;
// Piper model paths by language
// ניתן להגדיר ב-.env: PIPER_MODEL_EN, PIPER_MODEL_ES, PIPER_MODEL_DE, PIPER_MODEL_NL_NL, etc.
const PIPER_MODELS = {
    'en': process.env.PIPER_MODEL_EN || '/opt/piper/voices/en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx',
    'es': process.env.PIPER_MODEL_ES || '/opt/piper/voices/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx',
    'pt_PT': process.env.PIPER_MODEL_PT_PT || '/opt/piper/voices/pt/pt_PT/tugao/medium/pt_PT-tugao-medium.onnx',
    'pt_BR': process.env.PIPER_MODEL_PT_BR || '/opt/piper/voices/pt/pt_BR/cadu/medium/pt_BR-cadu-medium.onnx',
    'de': process.env.PIPER_MODEL_DE || '/opt/piper/voices/de/de_DE/thorsten/high/de_DE-thorsten-high.onnx',
    'nl_NL': process.env.PIPER_MODEL_NL_NL || '/opt/piper/voices/nl/nl_NL/ronnie/medium/nl_NL-ronnie-medium.onnx',
    'nl_BE': process.env.PIPER_MODEL_NL_BE || '/opt/piper/voices/nl/nl_BE/rdh/medium/nl_BE-rdh-medium.onnx',
    // מודלים נוספים (לא מותקנים כרגע):
    'he': process.env.PIPER_MODEL_HE || null, // עברית
    'ar': process.env.PIPER_MODEL_AR || null, // ערבית
    'ru': process.env.PIPER_MODEL_RU || null, // רוסית
    'zh': process.env.PIPER_MODEL_ZH || null, // סינית/יפנית/קוריאנית
};

const PIPER_BIN = process.env.PIPER_BIN || '/opt/piper/.venv/bin/piper'; // נתיב אבסולוטי
const MONTHLY_CHAR_LIMIT = 200000; // 200K characters per month

// Development/Test Mode - מאפשר לנסות בלי Freemius
// הגדר TEST_MODE=true ב-.env או הפעל עם NODE_ENV=development כדי לדלג על בדיקת Freemius לחלוטין
// ב-TEST_MODE, השרת לא ינסה להתחבר ל-Freemius API בכלל
const TEST_MODE = process.env.TEST_MODE === 'false' || process.env.NODE_ENV === 'production';
const TEST_LICENSE_KEY = 'TEST'; // במקרה של test mode, השתמש ב-"TEST" כ-license_key

// Debug: Print environment configuration on startup
console.log('\n📋 Environment Configuration:');
console.log(`   TEST_MODE: ${TEST_MODE} (from TEST_MODE=${process.env.TEST_MODE || 'undefined'}, NODE_ENV=${process.env.NODE_ENV || 'undefined'})`);
console.log(`   FREEMIUS_DEVELOPER_ID: ${FREEMIUS_DEVELOPER_ID}`);
console.log(`   FREEMIUS_PLUGIN_ID: ${FREEMIUS_PLUGIN_ID}`);
console.log(`   FREEMIUS_PUBLIC_KEY: ${FREEMIUS_PUBLIC_KEY.substring(0, 10)}...`);
if (TEST_MODE) {
    console.log('   ⚠️  TEST MODE ENABLED - Freemius validation will be skipped');
} else {
    console.log('   🔐 Freemius validation is ACTIVE');
}

// Display supported languages
console.log('\n🌍 Supported Languages:');
const languageNames = { 
    'en': 'English', 
    'es': 'Español (Spanish)',
    'pt_PT': 'Português PT (Portuguese Portugal)',
    'pt_BR': 'Português BR (Portuguese Brazil)',
    'de': 'Deutsch (German)',
    'nl_NL': 'Nederlands NL (Dutch Netherlands)',
    'nl_BE': 'Nederlands BE (Dutch Belgium)',
    'he': 'עברית (Hebrew)', 
    'ar': 'ערבית (Arabic)',
    'ru': 'Русский (Russian)',
    'zh': '中文/日本語/한국어 (CJK)'
};
for (const [lang, modelPath] of Object.entries(PIPER_MODELS)) {
    if (modelPath && fs.existsSync(modelPath)) {
        console.log(`   ✅ ${languageNames[lang] || lang}: ${modelPath}`);
    } else if (modelPath) {
        console.log(`   ⚠️  ${languageNames[lang] || lang}: Model file not found at ${modelPath}`);
    } else {
        console.log(`   ❌ ${languageNames[lang] || lang}: Not configured (set PIPER_MODEL_${lang.toUpperCase()} in .env)`);
    }
}
console.log('');

// Initialize DB (fire and forget)
initDatabase().catch(err => {
    console.error('DB init error:', err);
});

// Note: Audio files are sent directly to WordPress; metadata stored in DB

// In-memory database for metering (in production, use Redis or PostgreSQL)
const usageDB = new Map(); // legacy in-memory fallback if DB not configured

// Plan post quotas per month (approximate; adjust as needed)
const PLAN_POST_LIMITS = {
    trial: 1,
    starter: 50,
    creator: 150,
    pro: 500,
    agency: 2000,
    unlimited: Number.MAX_SAFE_INTEGER
};

async function upsertLicenseFromValidation(licenseKey, validation) {
    if (!dbPool) return; // if DB missing, skip
    const isTest = TEST_MODE ? 1 : 0;
    const plan = (validation && validation.license && (validation.license.plan_title || validation.license.plan_name)) || 'trial';
    const normPlan = (plan || '').toString().toLowerCase();
    const plan_code = ['trial','starter','creator','pro','agency','unlimited'].includes(normPlan) ? normPlan : 'trial';
    const status = (validation && validation.license && (validation.license.is_active ? 'active' : 'expired')) || 'active';
    const period = (validation && validation.license && (validation.license.billing_cycle || validation.license.period)) || 'monthly';
    const normPeriod = ['monthly','yearly','lifetime'].includes((period||'').toString().toLowerCase()) ? period.toString().toLowerCase() : 'monthly';
    const nextRenewal = validation && validation.license && (validation.license.next_bill_at || validation.license.expires);

    const conn = await dbPool.getConnection();
    try {
        await conn.query(
            `INSERT INTO licenses (license_key, plan_code, status, period, is_test, validated_at, next_renewal_at)
             VALUES (?, ?, ?, ?, ?, NOW(), ?)
             ON DUPLICATE KEY UPDATE 
               plan_code=VALUES(plan_code),
               status=VALUES(status),
               period=VALUES(period),
               is_test=VALUES(is_test),
               validated_at=VALUES(validated_at),
               next_renewal_at=VALUES(next_renewal_at)`,
            [licenseKey, plan_code, status, normPeriod, isTest, nextRenewal ? new Date(nextRenewal) : null]
        );
    } finally {
        conn.release();
    }
}

async function fetchLicenseRow(licenseKey) {
    if (!dbPool) return null;
    const [rows] = await dbPool.query('SELECT * FROM licenses WHERE license_key=?', [licenseKey]);
    return rows[0] || null;
}

async function ensureUsageRow(licenseKey, month) {
    if (!dbPool) return;
    await dbPool.query(
        `INSERT IGNORE INTO usage_month (license_key, month) VALUES (?, ?)`,
        [licenseKey, month]
    );
}

async function jsonSearchPost(conn, licenseKey, month, postId) {
    const [rows] = await conn.query(
        `SELECT JSON_SEARCH(posts_used,'one',CAST(? AS CHAR),NULL,'$[*]') AS found, posts_used_count
         FROM usage_month WHERE license_key=? AND month=? FOR UPDATE`,
        [String(postId), licenseKey, month]
    );
    return rows[0];
}

async function appendPostUsed(conn, licenseKey, month, postId) {
    await conn.query(
        `UPDATE usage_month
         SET posts_used = JSON_ARRAY_APPEND(posts_used,'$',CAST(? AS CHAR)),
             posts_used_count = posts_used_count + 1
         WHERE license_key=? AND month=?`,
        [String(postId), licenseKey, month]
    );
}

async function incrementUsageCounters(licenseKey, textLength) {
    if (!dbPool) {
        // fallback memory
        const currentMonth = new Date().toISOString().slice(0, 7);
        if (!usageDB.has(licenseKey)) usageDB.set(licenseKey, { month: currentMonth, chars_used: 0, generate_count: 0 });
        const usage = usageDB.get(licenseKey);
        if (usage.month !== currentMonth) { usage.month = currentMonth; usage.chars_used = 0; usage.generate_count = 0; }
        usage.chars_used += textLength;
        usage.generate_count = (usage.generate_count || 0) + 1;
        return { used: usage.chars_used, limit: MONTHLY_CHAR_LIMIT, remaining: Math.max(0, MONTHLY_CHAR_LIMIT - usage.chars_used), generate_count: usage.generate_count };
    }
    const month = new Date().toISOString().slice(0, 7);
    await ensureUsageRow(licenseKey, month);
    await dbPool.query(
        `UPDATE usage_month SET 
            chars_used = chars_used + ?,
            generate_count = generate_count + 1
         WHERE license_key=? AND month=?`,
        [textLength, licenseKey, month]
    );
    const [rows] = await dbPool.query('SELECT chars_used, generate_count FROM usage_month WHERE license_key=? AND month=?', [licenseKey, month]);
    const u = rows[0] || { chars_used: 0, generate_count: 0 };
    return { used: Number(u.chars_used)||0, limit: MONTHLY_CHAR_LIMIT, remaining: Math.max(0, MONTHLY_CHAR_LIMIT - (Number(u.chars_used)||0)), generate_count: Number(u.generate_count)||0 };
}

async function revertCharsOnFailure(licenseKey, textLength) {
    if (!dbPool) {
        const usage = usageDB.get(licenseKey);
        if (usage) usage.chars_used = Math.max(0, usage.chars_used - textLength);
        return;
    }
    const month = new Date().toISOString().slice(0, 7);
    await dbPool.query(
        `UPDATE usage_month SET chars_used = GREATEST(chars_used - ?, 0) WHERE license_key=? AND month=?`,
        [textLength, licenseKey, month]
    );
}


/**
 * Get product info from Freemius (helper function to find Developer ID)
 * This uses the products endpoint with Bearer token
 */
async function getFreemiusProductInfo(productId, bearerToken) {
    try {
        const response = await axios.get(
            `https://api.freemius.com/v1/products/${productId}.json`,
            {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${bearerToken}`
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error('Freemius product info error:', error.response?.data || error.message);
        return null;
    }
}

/**
 * Generate FS Authorization headers for Freemius API
 * Based on Freemius SDK implementation
 */
function generateFSAuthorization(resourceUrl, method, body) {
    const now = new Date();
    const date = now.toUTCString(); // RFC 2822 format
    
    let contentMd5 = '';
    let contentType = '';
    
    if (method === 'POST' || method === 'PUT') {
        contentType = 'application/json';
        if (body) {
            const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
            contentMd5 = crypto.createHash('md5').update(bodyString).digest('hex');
        }
    }
    
    // Build string to sign
    const stringToSign = [
        method.toUpperCase(),
        contentMd5,
        contentType,
        date,
        resourceUrl
    ].join('\n');
    
    // Generate HMAC-SHA256 signature
    const signature = crypto
        .createHmac('sha256', FREEMIUS_SECRET_KEY)
        .update(stringToSign)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    
    // Determine auth type (FS or FSP)
    const authType = FREEMIUS_SECRET_KEY !== FREEMIUS_PUBLIC_KEY ? 'FS' : 'FSP';
    
    // Build authorization header
    const authorization = `${authType} ${FREEMIUS_DEVELOPER_ID}:${FREEMIUS_PUBLIC_KEY}:${signature}`;
    
    const headers = {
        'Date': date,
        'Authorization': authorization,
        'Content-Type': contentType || 'application/json'
    };
    
    if (contentMd5) {
        headers['Content-MD5'] = contentMd5;
    }
    
    return headers;
}

/**
 * Validate license with Freemius using FS Authorization
 */
async function validateFreemiusLicense(licenseKey) {
    try {
        const resourceUrl = `:/developers/${FREEMIUS_DEVELOPER_ID}/plugins/${FREEMIUS_PLUGIN_ID}/licenses/validate.json`;
        const url = `${FREEMIUS_API_URL}/${FREEMIUS_DEVELOPER_ID}/plugins/${FREEMIUS_PLUGIN_ID}/licenses/validate.json`;
        
        const requestBody = {
            license_key: licenseKey
        };
        
        const headers = generateFSAuthorization(resourceUrl, 'POST', requestBody);
        
        const response = await axios.post(
            url,
            requestBody,
            {
                headers: headers
            }
        );

        return {
            valid: response.data.license && response.data.license.is_active,
            license: response.data.license
        };
    } catch (error) {
        console.error('Freemius validation error:', JSON.stringify({
            path: error.response?.data?.path || 'unknown',
            error: error.response?.data?.error || { message: error.message },
            request: { license_key: licenseKey.substring(0, 8) + '...', developer_id: FREEMIUS_DEVELOPER_ID, plugin_id: FREEMIUS_PLUGIN_ID }
        }, null, 2));
        return {
            valid: false,
            error: error.response?.data?.error?.message || 'License validation failed'
        };
    }
}

/**
 * Get or validate license and persist in DB
 */
async function getOrValidateLicense(licenseKey) {
    // TEST_MODE: fake valid license
    if (TEST_MODE) {
        const validation = { valid: true, license: { is_active: true, plan_title: 'trial', billing_cycle: 'monthly', test_mode: true } };
        await upsertLicenseFromValidation(licenseKey, validation);
        return await fetchLicenseRow(licenseKey);
    }

    // If DB available, try recent cached license (validated within last 24h)
    if (dbPool) {
        const row = await fetchLicenseRow(licenseKey);
        const now = Date.now();
        const validatedAt = row && row.validated_at ? new Date(row.validated_at).getTime() : 0;
        if (row && validatedAt && now - validatedAt < 24 * 3600 * 1000) {
            return row;
        }
    }

    // Validate with Freemius and upsert
    const validation = await validateFreemiusLicense(licenseKey);
    if (!validation.valid) {
        return null;
    }
    await upsertLicenseFromValidation(licenseKey, validation);
    return dbPool ? (await fetchLicenseRow(licenseKey)) : {
        license_key: licenseKey,
        plan_code: 'trial',
        status: 'active',
        period: 'monthly',
        is_test: 0
    };
}

/**
 * Check and update character usage (metering)
 */
function checkAndUpdateUsage(licenseKey, textLength) {
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    
    if (!usageDB.has(licenseKey)) {
        usageDB.set(licenseKey, { 
            month: currentMonth, 
            chars_used: 0,
            generate_count: 0,
            wp_user_ids: new Set()
        });
    }
    
    const usage = usageDB.get(licenseKey);
    
    // Reset if new month
    if (usage.month !== currentMonth) {
        usage.month = currentMonth;
        usage.chars_used = 0;
        usage.generate_count = 0;
        usage.wp_user_ids = new Set();
    }
    
    // Check if limit exceeded
    if (usage.chars_used + textLength > MONTHLY_CHAR_LIMIT) {
        return {
            allowed: false,
            used: usage.chars_used,
            limit: MONTHLY_CHAR_LIMIT,
            remaining: Math.max(0, MONTHLY_CHAR_LIMIT - usage.chars_used),
            generate_count: usage.generate_count || 0
        };
    }
    
    // Update usage
    usage.chars_used += textLength;
    
    return {
        allowed: true,
        used: usage.chars_used,
        limit: MONTHLY_CHAR_LIMIT,
        remaining: MONTHLY_CHAR_LIMIT - usage.chars_used,
        generate_count: usage.generate_count || 0
    };
}

/**
 * Increment generate counter for a license
 */
function incrementGenerateCount(licenseKey, wpUserId = null) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    if (!usageDB.has(licenseKey)) {
        usageDB.set(licenseKey, { 
            month: currentMonth, 
            chars_used: 0,
            generate_count: 0,
            wp_user_ids: new Set()
        });
    }
    
    const usage = usageDB.get(licenseKey);
    
    // Reset if new month
    if (usage.month !== currentMonth) {
        usage.month = currentMonth;
        usage.chars_used = 0;
        usage.generate_count = 0;
        usage.wp_user_ids = new Set();
    }
    
    // Track WP user ID if provided
    if (wpUserId) {
        usage.wp_user_ids.add(wpUserId);
    }
    
    // Increment counter
    usage.generate_count = (usage.generate_count || 0) + 1;
    
    return usage.generate_count;
}

/**
 * Detect language from text using franc library (professional LID)
 * Returns language code compatible with our Piper models
 * 
 * franc returns ISO 639-3 codes, we map them to our language codes:
 * - eng -> en
 * - spa -> es
 * - deu -> de
 * - nld -> nl_NL (default to Netherlands Dutch)
 * - por -> pt_BR (default to Brazilian Portuguese)
 * - heb -> he
 * - ara -> ar
 * - rus -> ru
 * - cmn/zho -> zh (Chinese)
 * - jpn -> zh (Japanese, mapped to CJK)
 * - kor -> zh (Korean, mapped to CJK)
 * 
 * @param {string} text - Text to detect language for
 * @param {string} hintLang - Optional hint language (e.g., 'pt_PT', 'pt_BR', 'nl_BE')
 * @returns {Promise<string>} Language code
 */
async function detectLanguage(text, hintLang) {
    // Remove excessive whitespace but keep some structure for better detection
    const cleanText = (text || '').trim().replace(/\s+/g, ' ');
    
    if (cleanText.length < 10) {
        // Too short for reliable detection - default to English
        return 'en';
    }
    
    try {
        // Use franc for language detection
        // franc returns ISO 639-3 code (3 letters) or 'und' (undefined) if unsure
        const franc = await getFranc();
        const detectedCode = franc(cleanText, { minLength: 10 });
        
        // franc may return 'und' (undefined) for very short or mixed text
        if (!detectedCode || detectedCode === 'und') {
            console.log(`⚠️  franc returned undefined/und for text, defaulting to English`);
            return 'en';
        }
        
        // Map franc ISO 639-3 codes to our language codes
        const languageMap = {
            // English variants
            'eng': 'en',
            
            // Spanish
            'spa': 'es',
            
            // German
            'deu': 'de',
            
            // Dutch - default to Netherlands Dutch
            'nld': 'nl_NL',
            
            // Portuguese - default to Brazilian Portuguese
            'por': 'pt_BR',
            
            // Hebrew
            'heb': 'he',
            
            // Arabic
            'ara': 'ar',
            
            // Russian
            'rus': 'ru',
            
            // Chinese - map to zh (CJK category)
            'cmn': 'zh', // Mandarin Chinese
            'zho': 'zh', // Chinese (generic)
            
            // Japanese - map to zh (CJK category)
            'jpn': 'zh',
            
            // Korean - map to zh (CJK category)
            'kor': 'zh',
        };
        
        // Check if detected language is in our map
        let mappedLanguage = languageMap[detectedCode];
        
        // If detected Portuguese, use hint or default to Brazilian (franc doesn't distinguish PT vs BR)
        if (detectedCode === 'por') {
            if (hintLang) {
                const h = hintLang.replace('-', '_');
                if (h === 'pt_PT' || h === 'pt_BR') {
                    mappedLanguage = h;
                } else {
                    mappedLanguage = 'pt_BR'; // Default to Brazilian
                }
            } else {
                mappedLanguage = 'pt_BR'; // Default to Brazilian
            }
        }
        
        // If detected Dutch, use hint or default to Netherlands Dutch (franc doesn't distinguish NL vs BE)
        if (detectedCode === 'nld') {
            if (hintLang) {
                const h = hintLang.replace('-', '_');
                if (h === 'nl_BE' || h === 'nl_NL') {
                    mappedLanguage = h;
                } else {
                    mappedLanguage = 'nl_NL'; // Default to Netherlands Dutch
                }
            } else {
                mappedLanguage = 'nl_NL'; // Default to Netherlands Dutch
            }
        }
        
        // If not in map or undefined, default to English
        if (!mappedLanguage) {
            // Log unknown language for debugging
            console.log(`⚠️  Unknown language code from franc: ${detectedCode}, defaulting to English`);
            return 'en';
        }
        
        return mappedLanguage;
    } catch (error) {
        // Fallback to English if franc throws an error
        console.error(`Error in detectLanguage: ${error.message}`);
        return 'en';
    }
}

/**
 * Get model path for a language
 * Returns { modelPath, language } or throws error if language not supported
 */
async function getModelForLanguage(text, hintLang) {
    // if client explicitly requested a supported language, prefer it
    if (hintLang && PIPER_MODELS[hintLang]) {
      const mp = PIPER_MODELS[hintLang];
      if (!fs.existsSync(mp)) throw new Error(`מודל לא נמצא בנתיב: ${mp}`);
      return { modelPath: mp, language: hintLang };
    }
  
    const language = await detectLanguage(text, hintLang);
    const modelPath = PIPER_MODELS[language];
  
    if (!modelPath) {
      const supportedLangs = Object.entries(PIPER_MODELS)
        .filter(([, v]) => !!v)
        .map(([k]) => k).join(', ');
      throw new Error(`מודל לשפה "${language}" לא מוגדר. השפות המותקנות: ${supportedLangs || 'אנגלית בלבד'}.`);
    }
    if (!fs.existsSync(modelPath)) {
      throw new Error(`מודל לא נמצא בנתיב: ${modelPath}`);
    }
    return { modelPath, language };
  }

/**
 * Generate audio using Piper TTS
 */
function runPiper(text, modelPath, outPath) {
    return new Promise((resolve, reject) => {
        const p = spawn(PIPER_BIN, ["-m", modelPath, "-f", outPath], {
            stdio: ["pipe", "ignore", "pipe"],
        });

        let err = "";
        p.stderr.on("data", (d) => (err += d.toString()));

        p.on("close", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(err || `piper exited ${code}`));
            }
        });

        p.stdin.end(text + "\n"); // אין צורך ב-printf ואין בעיות ציטוטים בעברית
    });
}

async function generateAudioWithPiper(text, hintLang) {
    const { modelPath, language } = await getModelForLanguage(text, hintLang);
    const tempFilePath = path.join('/tmp', `piper_out_${Date.now()}_${Math.floor(Math.random()*1000)}.wav`);
  
    try {
      await runPiper(text, modelPath, tempFilePath);
      const data = fs.readFileSync(tempFilePath);
      console.log(`Piper successfully generated ${data.length} bytes using ${language} model.`);
      return data;
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlink(tempFilePath, () => {});
      }
    }
  }

// Audio files are sent directly to WordPress, no storage function needed

/**
 * Language detection endpoint
 */
app.post('/detect-language', async (req, res) => {
    try {
      const { text, langHint } = req.body;
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'Text is required' });
      }
      const detectedLanguage = await detectLanguage(text, langHint);
  
      const availableLanguages = Object.keys(PIPER_MODELS).filter(l => PIPER_MODELS[l]);
      const languageNames = { 
        'en':'English','es':'Español (Spanish)','pt_PT':'Português PT (Portuguese Portugal)','pt_BR':'Português BR (Portuguese Brazil)','de':'Deutsch (German)','nl_NL':'Nederlands NL (Dutch Netherlands)','nl_BE':'Nederlands BE (Dutch Belgium)','he':'עברית (Hebrew)','ar':'ערבית (Arabic)','ru':'Русский (Russian)','zh':'中文/日本語/한국어 (CJK)'
      };
  
      res.json({
        detected: detectedLanguage,
        available: availableLanguages.map(code => ({ code, name: languageNames[code] || code, isDetected: code === detectedLanguage })),
        languageName: languageNames[detectedLanguage] || detectedLanguage
      });
    } catch (error) {
      console.error('Error in /detect-language:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

/**
 * Main API endpoint
 */
app.post('/generate', async (req, res) => {
    try {
        const { license_key, wp_user_id, text, model, voice, language, post_id, wp_post_id } = req.body;
        const postId = wp_post_id || post_id || null;
        
        // Validate input
        if (!license_key || !text) {
            return res.status(400).json({ error: 'Missing license_key or text' });
        }
        
        if (typeof text !== 'string' || text.trim().length === 0) {
            return res.status(400).json({ error: 'Text must be a non-empty string' });
        }
        
        const textLength = text.length;
        
        // Step 1: Validate license & persist (או מצב בדיקה)
        console.log(`Validating license: ${license_key.substring(0, 8)}...`);
        const licenseRow = await getOrValidateLicense(license_key);
        if (!licenseRow) {
            return res.status(403).json({ error: 'Invalid or expired license' });
        }
        const planCode = licenseRow.plan_code || 'trial';
        const status = licenseRow.status || 'active';
        if (!['trialing','active'].includes(status)) {
            return res.status(403).json({ error: 'License is not active' });
        }
        
        // Step 2: Trial lock & post quota enforcement in DB
        if (dbPool) {
            if (!postId) {
                return res.status(400).json({ error: 'post_id is required for usage tracking' });
            }
            const conn = await dbPool.getConnection();
            try {
                await conn.beginTransaction();

                // Lock license row
                const [licRows] = await conn.query('SELECT * FROM licenses WHERE license_key=? FOR UPDATE', [license_key]);
                const lic = licRows[0];
                if (!lic) {
                    throw new Error('License row missing');
                }

                // Trial logic: lock to first post
                if (lic.plan_code === 'trial') {
                    if (!lic.trial_post_id) {
                        await conn.query('UPDATE licenses SET trial_post_id=? WHERE license_key=?', [postId, license_key]);
                    } else if (String(lic.trial_post_id) !== String(postId)) {
                        await conn.rollback();
                        return res.status(402).json({ error: 'Trial locked to another post' });
                    }
                }

                const currentMonth = new Date().toISOString().slice(0, 7);
                // Ensure usage row exists
                await conn.query('INSERT IGNORE INTO usage_month (license_key, month) VALUES (?, ?)', [license_key, currentMonth]);

                // Lock usage row and check if post already counted
                const row = await jsonSearchPost(conn, license_key, currentMonth, postId);
                const alreadyCounted = !!row && row.found !== null;
                if (!alreadyCounted) {
                    const postsUsedCount = Number(row.posts_used_count) || 0;
                    const limit = PLAN_POST_LIMITS[lic.plan_code] ?? PLAN_POST_LIMITS.trial;
                    if (postsUsedCount >= limit) {
                        await conn.rollback();
                        return res.status(402).json({ error: 'Monthly post quota exceeded for plan' });
                    }
                    await appendPostUsed(conn, license_key, currentMonth, postId);
                }
                await conn.commit();
            } catch (e) {
                try { await conn.rollback(); } catch (_) {}
                throw e;
            } finally {
                conn.release();
            }
        }

        // Step 3: Check metering (monthly character limit)
        const usage = await incrementUsageCounters(license_key, textLength);
        
        if (!usage.allowed) {
            return res.status(429).json({
                error: 'Monthly character limit exceeded',
                usage: {
                    used: usage.used,
                    limit: usage.limit,
                    remaining: usage.remaining,
                    generate_count: usage.generate_count
                }
            });
        }
        
        // Step 3.5: Increment generate counter (DB-backed usage already increments generate_count; fallback for memory)
        const generateCount = usage.generate_count || incrementGenerateCount(license_key, wp_user_id);
        console.log(`Generate count for license ${license_key.substring(0, 8)}... (WP User ID: ${wp_user_id || 'N/A'}): ${generateCount}`);
        
        // Step 3: Generate audio with Piper
        console.log(`Generating audio for ${textLength} characters...`);
        let audioBuffer;
        try {
// בתוך /generate:
audioBuffer = await generateAudioWithPiper(text, language || null);
        } catch (audioError) {
            console.error('Audio generation failed:', audioError);
            // Revert usage since generation failed
            await revertCharsOnFailure(license_key, textLength);
            return res.status(500).json({
                error: audioError.message || 'Failed to generate audio'
            });
        }
        
        // Validate audio buffer
        if (!audioBuffer || audioBuffer.length === 0) {
            console.error('Generated audio buffer is empty');
            // Revert usage since generation failed
            const usageEntry = usageDB.get(license_key);
            if (usageEntry) {
                usageEntry.chars_used = Math.max(0, usageEntry.chars_used - textLength);
            }
            return res.status(500).json({
                error: 'Generated audio is empty'
            });
        }
        
        // Step 4: Return audio binary directly to client (WordPress will save it)
        // Convert buffer to base64 for JSON transmission
        const audioBase64 = audioBuffer.toString('base64');
        
        // Step 5: Return success response with audio data
        res.json({
            success: true,
            audio_data: audioBase64, // Base64 encoded audio file
            audio_mime: 'audio/wav',
            filename: `audio_${Date.now()}.wav`,
            usage: {
                used: usage.used,
                limit: usage.limit,
                remaining: usage.remaining,
                this_request: textLength,
                generate_count: generateCount
            }
        });
        
    } catch (error) {
        console.error('Error in /generate:', error);
        console.error('Error stack:', error.stack);
        
        // Make sure response hasn't been sent yet
        if (!res.headersSent) {
            res.status(500).json({
                error: error.message || 'Internal server error'
            });
        }
    }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        test_mode: TEST_MODE,
        note: TEST_MODE ? 
            'Audio files are stored directly in WordPress media library. TEST MODE ENABLED - use "TEST" as license_key for testing' :
            'Audio files are stored directly in WordPress media library'
    });
});

/**
 * Statistics endpoint (admin) - Get all user stats
 */
app.get('/admin/stats', async (req, res) => {
    try {
        // Simple authentication (in production, use proper auth)
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== process.env.ADMIN_KEY) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const stats = [];
        const currentMonth = new Date().toISOString().slice(0, 7);
        
        for (const [licenseKey, usage] of usageDB.entries()) {
            if (usage.month === currentMonth) {
                stats.push({
                    license_key: licenseKey.substring(0, 8) + '...', // Partial key for privacy
                    month: usage.month,
                    chars_used: usage.chars_used,
                    generate_count: usage.generate_count || 0,
                    remaining: MONTHLY_CHAR_LIMIT - usage.chars_used,
                    wp_user_ids: usage.wp_user_ids ? Array.from(usage.wp_user_ids) : [], // WP User IDs using this license
                    unique_users: usage.wp_user_ids ? usage.wp_user_ids.size : 0 // Number of unique WP users
                });
            }
        }
        
        // Sort by generate_count descending
        stats.sort((a, b) => b.generate_count - a.generate_count);
        
        res.json({
            month: currentMonth,
            total_users: stats.length,
            total_generates: stats.reduce((sum, s) => sum + s.generate_count, 0),
            stats: stats
        });
        
    } catch (error) {
        console.error('Error in /admin/stats:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});

/**
 * Usage check endpoint (for user to check their usage)
 */
app.post('/usage', async (req, res) => {
    try {
        const { license_key } = req.body;
        
        if (!license_key) {
            return res.status(400).json({ error: 'Missing license_key' });
        }
        
        // Validate license (או מצב בדיקה)
        // ב-TEST_MODE, אנחנו לא מנסים להתחבר ל-Freemius בכלל
        let validation;
        if (TEST_MODE) {
            validation = {
                valid: true,
                license: { is_active: true, test_mode: true }
            };
        } else {
            validation = await validateFreemiusLicense(license_key);
            
            if (!validation.valid) {
                return res.status(403).json({
                    error: 'Invalid or expired license'
                });
            }
        }
        
        // Get usage
        const currentMonth = new Date().toISOString().slice(0, 7);
        const usage = usageDB.get(license_key) || { 
            month: currentMonth, 
            chars_used: 0,
            generate_count: 0,
            wp_user_ids: new Set()
        };
        
        // Reset if new month
        if (usage.month !== currentMonth) {
            usage.month = currentMonth;
            usage.chars_used = 0;
            usage.generate_count = 0;
            usage.wp_user_ids = new Set();
        }
        
        res.json({
            month: usage.month,
            used: usage.chars_used,
            limit: MONTHLY_CHAR_LIMIT,
            remaining: MONTHLY_CHAR_LIMIT - usage.chars_used,
            percentage: ((usage.chars_used / MONTHLY_CHAR_LIMIT) * 100).toFixed(2),
            generate_count: usage.generate_count || 0
        });
        
    } catch (error) {
        console.error('Error in /usage:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});

// Process-level error handlers to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't exit, but log the error so the server keeps running
});

const PORT = process.env.PORT || 3004;
app.listen(PORT, () => {
    console.log('');
    console.log('🚀 Audio-Press AI Server started successfully!');
    console.log(`   Port: ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Test Mode: ${TEST_MODE ? '✅ ENABLED (Freemius disabled)' : '❌ DISABLED (Freemius active)'}`);
    console.log('');
    if (!TEST_MODE) {
        console.log('⚠️  WARNING: Freemius validation is ACTIVE');
        console.log('   To disable Freemius, set TEST_MODE=true in .env or NODE_ENV=development');
        console.log('');
    }
});

