const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// MySQL is optional - load only if configured
let mysql = null;
try {
    mysql = require('mysql2/promise');
} catch (error) {
    console.log('⚠️  mysql2 package not installed. Database features disabled.');
    console.log('   To enable: npm install mysql2');
}
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
const MAX_CHARS_SPLIT_THRESHOLD = Number(process.env.MAX_CHARS_SPLIT_THRESHOLD || 3000); // פיצול טקסט ארוך לעיבוד בלבד

// MySQL Database Configuration
const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'audio',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'audio_press_ai',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const DB_TABLE_NAME = process.env.DB_TABLE_NAME || 'usage_month';
const DB_LICENSES_TABLE = process.env.DB_LICENSES_TABLE || 'licenses';
let dbConnection = null;
let dbPool = null;

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

// Note: Audio files are sent directly to WordPress, no storage needed on this server

// In-memory cache for usage tracking (backed by MySQL)
// license_key -> { month: '2025-01', posts_used: Set<post_id>, trial_post_id: string|null, generate_count: number, chars_used: number }
if (!global.usageDB) global.usageDB = new Map();

/**
 * Initialize MySQL connection and create table if needed
 */
async function initDatabase() {
    // Check if mysql2 is installed
    if (!mysql) {
        console.error('⚠️  mysql2 package not installed. Database features disabled.');
        console.error('   To enable database storage: npm install mysql2');
        console.error('   Then configure DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in .env');
        return false;
    }
    
    // Check if database config is provided
    if (!DB_CONFIG.host || !DB_CONFIG.user || !DB_CONFIG.database) {
        console.log('ℹ️  Database not configured (DB_HOST/DB_USER/DB_NAME missing in .env)');
        console.log('   Using in-memory storage only');
        return false;
    }
    
    try {
        // First, try to connect without database to test credentials
        const tempConfig = { 
            host: DB_CONFIG.host,
            user: DB_CONFIG.user,
            password: DB_CONFIG.password,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        };
        
        let tempConnection = null;
        try {
            tempConnection = await mysql.createConnection(tempConfig);
            // Try to create database (may fail if user doesn't have CREATE privilege, that's OK)
            try {
                await tempConnection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\``);
            } catch (createError) {
                // Database might already exist or user doesn't have CREATE privilege
                // This is OK - we'll try to connect to existing database
                if (createError.code === 'ER_ACCESS_DENIED_ERROR') {
                    console.log(`   Note: User '${DB_CONFIG.user}' cannot create databases (CREATE privilege required)`);
                    console.log(`   Assuming database '${DB_CONFIG.database}' already exists`);
                }
            }
            await tempConnection.end();
        } catch (tempError) {
            // If we can't even connect, show helpful error
            if (tempError.code === 'ER_ACCESS_DENIED_ERROR') {
                throw new Error(`Access denied for user '${DB_CONFIG.user}'@'${DB_CONFIG.host}'. Check DB_USER and DB_PASSWORD.`);
            } else if (tempError.code === 'ECONNREFUSED') {
                throw new Error(`Cannot connect to MySQL server at ${DB_CONFIG.host}. Check DB_HOST and ensure MySQL is running.`);
            }
            throw tempError;
        }

        // Now connect to the specific database
        dbPool = mysql.createPool(DB_CONFIG);
        
        // Test the connection and database access
        try {
            await dbPool.query('SELECT 1');
        } catch (dbError) {
            if (dbError.code === 'ER_BAD_DB_ERROR') {
                throw new Error(`Database '${DB_CONFIG.database}' does not exist. Create it manually:\n   CREATE DATABASE \`${DB_CONFIG.database}\`;`);
            } else if (dbError.code === 'ER_ACCESS_DENIED_ERROR') {
                throw new Error(`Access denied for user '${DB_CONFIG.user}' to database '${DB_CONFIG.database}'. Grant privileges:\n   GRANT ALL ON \`${DB_CONFIG.database}\`.* TO '${DB_CONFIG.user}'@'localhost';`);
            }
            throw dbError;
        }

        // Create tables per the required DDL
        const createLicensesDDL = `
CREATE TABLE IF NOT EXISTS \`${DB_LICENSES_TABLE}\` (
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

        const createUsageMonthDDL = `
CREATE TABLE IF NOT EXISTS \`${DB_TABLE_NAME}\` (
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
    REFERENCES \`${DB_LICENSES_TABLE}\`(license_key) ON DELETE CASCADE,
  KEY idx_month (month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;

        await dbPool.query(createLicensesDDL);
        await dbPool.query(createUsageMonthDDL);
        
        // DDL is authoritative; no migrations
        
        console.log(`✅ Database initialized: ${DB_CONFIG.database}.${DB_TABLE_NAME} and ${DB_LICENSES_TABLE}`);
        return true;
    } catch (error) {
        console.error('⚠️  Database initialization failed:', error.message);
        if (dbPool) {
            try {
                await dbPool.end();
            } catch (e) {}
            dbPool = null;
        }
        return false;
    }
}

/**
 * Migrate tables - add missing columns if needed
 */
async function migrateTables() {
    if (!dbPool) return;
    
    try {
        // Check usage table columns
        const [usageColumns] = await dbPool.query(`SHOW COLUMNS FROM \`${DB_TABLE_NAME}\``);
        const usageColumnNames = usageColumns.map(col => col.Field);
        
        // Expected columns for usage table
        const expectedUsageColumns = {
            'id': 'INT AUTO_INCREMENT PRIMARY KEY',
            'license_key': 'VARCHAR(255) NOT NULL',
            'month': 'VARCHAR(7) NOT NULL',
            'posts_used': 'JSON NOT NULL',
            'trial_post_id': 'VARCHAR(255) DEFAULT NULL',
            'generate_count': 'INT DEFAULT 0',
            'chars_used': 'BIGINT DEFAULT 0',
            'plan': 'VARCHAR(50) DEFAULT NULL',
            'created_at': 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
            'updated_at': 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        };
        
        // Add missing columns to usage table
        for (const [columnName, columnDef] of Object.entries(expectedUsageColumns)) {
            if (!usageColumnNames.includes(columnName)) {
                try {
                    // Skip PRIMARY KEY for existing table
                    const cleanDef = columnDef.replace('AUTO_INCREMENT PRIMARY KEY', 'AUTO_INCREMENT');
                    await dbPool.query(`ALTER TABLE \`${DB_TABLE_NAME}\` ADD COLUMN \`${columnName}\` ${cleanDef}`);
                    console.log(`   ✅ Added missing column '${columnName}' to ${DB_TABLE_NAME}`);
                } catch (alterError) {
                    // Column might have been added by another process, or there's a syntax issue
                    console.log(`   ⚠️  Could not add column '${columnName}': ${alterError.message}`);
                }
            }
        }
        
        // Check and add indexes for usage table if missing
        const [usageIndexes] = await dbPool.query(`SHOW INDEXES FROM \`${DB_TABLE_NAME}\``);
        const usageIndexNames = usageIndexes.map(idx => idx.Key_name);
        
        // Add unique index for license_month if missing
        if (!usageIndexNames.includes('license_month')) {
            try {
                await dbPool.query(`ALTER TABLE \`${DB_TABLE_NAME}\` ADD UNIQUE KEY \`license_month\` (\`license_key\`, \`month\`)`);
                console.log(`   ✅ Added unique index 'license_month' to ${DB_TABLE_NAME}`);
            } catch (idxError) {
                // Index might already exist
                if (!idxError.message.includes('Duplicate key')) {
                    console.log(`   ⚠️  Could not add index 'license_month': ${idxError.message}`);
                }
            }
        }
        
        // Check licenses table columns
        const [licenseColumns] = await dbPool.query(`SHOW COLUMNS FROM \`${DB_LICENSES_TABLE}\``);
        const licenseColumnNames = licenseColumns.map(col => col.Field);
        
        // Expected columns for licenses table
        const expectedLicenseColumns = {
            'id': 'INT AUTO_INCREMENT PRIMARY KEY',
            'license_key': 'VARCHAR(255) NOT NULL UNIQUE',
            'plan': 'VARCHAR(50) DEFAULT NULL',
            'is_active': 'BOOLEAN DEFAULT TRUE',
            'expires_at': 'DATETIME DEFAULT NULL',
            'freemius_user_id': 'BIGINT DEFAULT NULL',
            'freemius_license_id': 'BIGINT DEFAULT NULL',
            'validated_at': 'TIMESTAMP NULL DEFAULT NULL',
            'created_at': 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
            'updated_at': 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        };
        
        // Add missing columns to licenses table
        for (const [columnName, columnDef] of Object.entries(expectedLicenseColumns)) {
            if (!licenseColumnNames.includes(columnName)) {
                try {
                    // Skip PRIMARY KEY for existing table
                    const cleanDef = columnDef.replace('AUTO_INCREMENT PRIMARY KEY', 'AUTO_INCREMENT').replace(' UNIQUE', '');
                    await dbPool.query(`ALTER TABLE \`${DB_LICENSES_TABLE}\` ADD COLUMN \`${columnName}\` ${cleanDef}`);
                    console.log(`   ✅ Added missing column '${columnName}' to ${DB_LICENSES_TABLE}`);
                    
                    // Add UNIQUE constraint separately if needed
                    if (columnDef.includes('UNIQUE') && columnName === 'license_key') {
                        try {
                            await dbPool.query(`ALTER TABLE \`${DB_LICENSES_TABLE}\` ADD UNIQUE KEY \`license_key\` (\`license_key\`)`);
                        } catch (uniqError) {
                            // Unique might already exist
                        }
                    }
                } catch (alterError) {
                    // Column might have been added by another process
                    console.log(`   ⚠️  Could not add column '${columnName}': ${alterError.message}`);
                }
            }
        }
        
        // Check and add indexes for licenses table if missing
        const [licenseIndexes] = await dbPool.query(`SHOW INDEXES FROM \`${DB_LICENSES_TABLE}\``);
        const licenseIndexNames = licenseIndexes.map(idx => idx.Key_name);
        
        // Add indexes if missing
        const indexesToAdd = [
            { name: 'idx_license_key', sql: 'KEY `idx_license_key` (`license_key`)' },
            { name: 'idx_is_active', sql: 'KEY `idx_is_active` (`is_active`)' },
            { name: 'idx_plan', sql: 'KEY `idx_plan` (`plan`)' }
        ];
        
        for (const idx of indexesToAdd) {
            if (!licenseIndexNames.includes(idx.name)) {
                try {
                    await dbPool.query(`ALTER TABLE \`${DB_LICENSES_TABLE}\` ADD ${idx.sql}`);
                    console.log(`   ✅ Added index '${idx.name}' to ${DB_LICENSES_TABLE}`);
                } catch (idxError) {
                    // Index might already exist
                    if (!idxError.message.includes('Duplicate key')) {
                        console.log(`   ⚠️  Could not add index '${idx.name}': ${idxError.message}`);
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('⚠️  Migration failed:', error.message);
        // Don't throw - allow server to continue even if migration fails
    }
}

/**
 * Load usage data from database
 */
async function loadUsageFromDB(licenseKey, month) {
    if (!dbPool) return null;
    
    try {
        const [rows] = await dbPool.query(
            `SELECT * FROM \`${DB_TABLE_NAME}\` WHERE license_key = ? AND month = ?`,
            [licenseKey, month]
        );
        
        if (rows.length === 0) return null;
        
        const row = rows[0];
        return {
            month: row.month,
            posts_used: new Set(JSON.parse(row.posts_used || '[]')),
            trial_post_id: row.trial_post_id,
            generate_count: row.generate_count || 0,
            chars_used: row.chars_used || 0,
            plan: row.plan
        };
    } catch (error) {
        console.error('Error loading usage from DB:', error.message);
        return null;
    }
}

/**
 * Save usage data to database
 */
async function saveUsageToDB(licenseKey, usage) {
    if (!dbPool) return false;
    
    try {
        const postsUsedArray = Array.from(usage.posts_used || []);
        
        await dbPool.query(
            `INSERT INTO \`${DB_TABLE_NAME}\` 
             (license_key, month, posts_used, trial_post_id, generate_count, chars_used, plan)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
             posts_used = VALUES(posts_used),
             trial_post_id = VALUES(trial_post_id),
             generate_count = VALUES(generate_count),
             chars_used = VALUES(chars_used),
             plan = VALUES(plan)`,
            [
                licenseKey,
                usage.month,
                JSON.stringify(postsUsedArray),
                usage.trial_post_id,
                usage.generate_count || 0,
                usage.chars_used || 0,
                usage.plan || null
            ]
        );
        return true;
    } catch (error) {
        console.error('Error saving usage to DB:', error.message);
        return false;
    }
}

/**
 * Save or update license information from Freemius validation
 */
// Replace old saveLicenseToDB with new upsert function
async function saveLicenseToDB(licenseKey, validation) {
    return upsertLicenseFromValidation(licenseKey, validation);
}

/**
 * Load license from database (cache, but still validate with Freemius periodically)
 */
async function loadLicenseFromDB(licenseKey) {
    if (!dbPool) return null;
    
    try {
        const [rows] = await dbPool.query(
            `SELECT * FROM \`${DB_LICENSES_TABLE}\` WHERE license_key = ?`,
            [licenseKey]
        );
        
        if (rows.length === 0) return null;
        
        const row = rows[0];
        // If license was validated more than 24 hours ago, return null to force re-validation
        const lastValidated = row.validated_at ? new Date(row.validated_at) : null;
        const hoursSinceValidation = lastValidated ? (Date.now() - lastValidated.getTime()) / (1000 * 60 * 60) : Infinity;
        
        if (hoursSinceValidation > 24) {
            return null; // Force re-validation
        }
        
        // Return the full row (new schema: plan_code, status, period, trial_post_id, is_test, etc.)
        return row;
    } catch (error) {
        console.error('Error loading license from DB:', error.message);
        return null;
    }
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
 * Note: This function should NOT be called when TEST_MODE is active
 */
async function validateFreemiusLicense(licenseKey) {
    // Safety check: if TEST_MODE is active, don't call Freemius
    if (TEST_MODE || licenseKey === 'TEST' || licenseKey === TEST_LICENSE_KEY) {
        console.log('⚠️  WARNING: validateFreemiusLicense was called with TEST_MODE active. Returning test validation.');
        return {
            valid: true,
            license: { is_active: true, test_mode: true }
        };
    }
    
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
 * Upsert license from validation (new DB schema)
 */
async function upsertLicenseFromValidation(licenseKey, validation) {
    if (!dbPool) return false;
    try {
        const lic = validation?.license || {};
        const planRaw = lic.plan?.name || lic.plan_title || 'trial';
        const plan_code = String(planRaw || 'trial').toLowerCase();
        const status = lic.is_active ? 'active' : 'expired';
        const periodRaw = lic.billing_cycle || lic.period || 'monthly';
        const period = ['monthly','yearly','lifetime'].includes(String(periodRaw).toLowerCase()) ? String(periodRaw).toLowerCase() : 'monthly';
        const is_test = lic.test_mode ? 1 : 0;
        const next_renewal_at = lic.next_bill_at ? new Date(lic.next_bill_at) : (lic.expires ? new Date(lic.expires * 1000) : null);

        await dbPool.query(
            `INSERT INTO \`${DB_LICENSES_TABLE}\` (license_key, plan_code, status, period, is_test, validated_at, next_renewal_at)
             VALUES (?, ?, ?, ?, ?, NOW(), ?)
             ON DUPLICATE KEY UPDATE
               plan_code=VALUES(plan_code),
               status=VALUES(status),
               period=VALUES(period),
               is_test=VALUES(is_test),
               validated_at=VALUES(validated_at),
               next_renewal_at=VALUES(next_renewal_at)`,
            [licenseKey, plan_code, status, period, is_test, next_renewal_at]
        );
        return true;
    } catch (e) {
        console.error('Error upserting license:', e.message);
        return false;
    }
}

/**
 * Get or validate license (cached or fresh)
 */
async function getOrValidateLicense(licenseKey) {
    if (!dbPool) return null; // DB not configured
    if (TEST_MODE || licenseKey === 'TEST' || licenseKey === TEST_LICENSE_KEY) {
        await upsertLicenseFromValidation(licenseKey, { license: { plan: { name: 'trial' }, is_active: true, test_mode: true } });
        const [rows] = await dbPool.query(`SELECT * FROM \`${DB_LICENSES_TABLE}\` WHERE license_key=?`, [licenseKey]);
        return rows[0] || null;
    }
    const cached = await loadLicenseFromDB(licenseKey);
    if (cached) return cached;
    const validation = await validateFreemiusLicense(licenseKey);
    if (!validation.valid) return null;
    await upsertLicenseFromValidation(licenseKey, validation);
    const [rows] = await dbPool.query(`SELECT * FROM \`${DB_LICENSES_TABLE}\` WHERE license_key=?`, [licenseKey]);
    return rows[0] || null;
}

// Plan post limits per month
const PLAN_POST_LIMITS = {
    trial: 1,
    starter: 50,
    creator: 150,
    pro: 500,
    agency: 2000,
    unlimited: Number.MAX_SAFE_INTEGER
};

async function ensureUsageRow(licenseKey, month) {
    if (!dbPool) return;
    await dbPool.query(`INSERT IGNORE INTO \`${DB_TABLE_NAME}\` (license_key, month) VALUES (?, ?)`, [licenseKey, month]);
}

async function jsonSearchPost(conn, licenseKey, month, postId) {
    const [rows] = await conn.query(
        `SELECT JSON_SEARCH(posts_used,'one',CAST(? AS CHAR),NULL,'$[*]') AS found, posts_used_count FROM \`${DB_TABLE_NAME}\` WHERE license_key=? AND month=? FOR UPDATE`,
        [String(postId), licenseKey, month]
    );
    return rows[0];
}

async function appendPostUsed(conn, licenseKey, month, postId) {
    await conn.query(
        `UPDATE \`${DB_TABLE_NAME}\` SET posts_used = JSON_ARRAY_APPEND(posts_used,'$',CAST(? AS CHAR)), posts_used_count = posts_used_count + 1 WHERE license_key=? AND month=?`,
        [String(postId), licenseKey, month]
    );
}

async function incrementUsageCountersDB(licenseKey, textLength) {
    if (!dbPool) return { used: 0, limit: 200000, remaining: 200000, generate_count: 0 };
    const month = new Date().toISOString().slice(0, 7);
    await ensureUsageRow(licenseKey, month);
    await dbPool.query(`UPDATE \`${DB_TABLE_NAME}\` SET chars_used = chars_used + ?, generate_count = generate_count + 1 WHERE license_key=? AND month=?`, [textLength, licenseKey, month]);
    const [rows] = await dbPool.query(`SELECT chars_used, generate_count FROM \`${DB_TABLE_NAME}\` WHERE license_key=? AND month=?`, [licenseKey, month]);
    const u = rows[0] || { chars_used: 0, generate_count: 0 };
    return { used: Number(u.chars_used)||0, limit: Number(process.env.MONTHLY_CHAR_LIMIT||200000), remaining: Math.max(0, Number(process.env.MONTHLY_CHAR_LIMIT||200000) - (Number(u.chars_used)||0)), generate_count: Number(u.generate_count)||0 };
}

async function revertCharsOnFailureDB(licenseKey, textLength) {
    if (!dbPool) return;
    const month = new Date().toISOString().slice(0, 7);
    await dbPool.query(`UPDATE \`${DB_TABLE_NAME}\` SET chars_used = GREATEST(chars_used - ?, 0) WHERE license_key=? AND month=?`, [textLength, licenseKey, month]);
}

/**
 * Resolve plan name from Freemius validation or environment
 */
function resolvePlan(validation) {
    // אם יש test_mode או אין תכנית בתשלום → trial
    if (validation?.license?.test_mode || !validation?.license?.plan?.name) {
        return 'trial';
    }
    // מ-Freemius; ב-TEST_MODE או ללא תכנית → trial
    const name = (validation?.license?.plan?.name || 'trial').toLowerCase();
    return name;
}

/**
 * Get plan limit (number of posts per month)
 */
function getPlanLimit(plan) {
    const L = {
        trial: Number(process.env.PLAN_LIMIT_TRIAL || 1),
        starter: Number(process.env.PLAN_LIMIT_STARTER || 50),
        creator: Number(process.env.PLAN_LIMIT_CREATOR || 150),
        pro: Number(process.env.PLAN_LIMIT_PRO || 500),
        agency: Number(process.env.PLAN_LIMIT_AGENCY || 2000),
        unlimited: Infinity,
    };
    return L[plan] ?? L[process.env.DEFAULT_PLAN || 'starter'];
}

/**
 * Get usage data for a license key (create if doesn't exist, reset if new month)
 * Loads from database if available, otherwise uses in-memory cache
 */
async function getUsage(licenseKey, plan = null) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    if (!global.usageDB) global.usageDB = new Map();
    
    const cacheKey = `${licenseKey}_${currentMonth}`;
    
    // Check cache first
    if (global.usageDB.has(cacheKey)) {
        return global.usageDB.get(cacheKey);
    }
    
    // Try to load from database
    let usage = await loadUsageFromDB(licenseKey, currentMonth);
    
    // If not found in DB, create new usage object
    if (!usage) {
        usage = { 
            month: currentMonth, 
            posts_used: new Set(), 
            trial_post_id: null, 
            generate_count: 0, 
            chars_used: 0,
            plan: plan
        };
        // Save to DB in background
        saveUsageToDB(licenseKey, usage).catch(err => console.error('Background save failed:', err));
    }
    
    // Reset if new month (shouldn't happen, but safety check)
    if (usage.month !== currentMonth) { 
        usage.month = currentMonth; 
        usage.posts_used = new Set(); 
        usage.generate_count = 0; 
        usage.chars_used = 0;
        if (plan) usage.plan = plan;
    }
    
    // Cache in memory
    global.usageDB.set(cacheKey, usage);
    
    return usage;
}

/**
 * Update usage data (saves to DB and updates cache)
 */
async function updateUsage(licenseKey, usage) {
    const cacheKey = `${licenseKey}_${usage.month}`;
    global.usageDB.set(cacheKey, usage);
    await saveUsageToDB(licenseKey, usage);
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
 * Split text into two parts if it exceeds maxLen (for processing only, not billing)
 */
function splitIntoTwo(text, maxLen = MAX_CHARS_SPLIT_THRESHOLD) {
    const t = (text || '').trim();
    if (t.length <= maxLen) return [t];
    
    // ננסה לפצל לשניים סביב האמצע, על גבול משפט/רווח
    const mid = Math.floor(t.length / 2);
    const leftCut = t.lastIndexOf('.', mid); // חפש סוף משפט שמאלה
    const leftCut2 = t.lastIndexOf(' ', mid); // או רווח
    
    // בחר את החיתוך הטוב ביותר (אבל לא פחות מ-maxLen)
    let cut = Math.max(leftCut, leftCut2);
    if (cut < maxLen) cut = maxLen; // נפילת-גבול למקסימום
    
    return [t.slice(0, cut).trim(), t.slice(cut).trim()];
}

/**
 * Generate audio using Piper TTS
 */
function runPiper(text, modelPath, outPath) {
    return new Promise((resolve, reject) => {
        const p = spawn(PIPER_BIN, ["-m", modelPath, "-f", outPath, "-q"], {
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

        p.stdin.end((text || "") + "\n");
    });
}

/**
 * Synthesize text to WAV file, splitting into two parts if needed and concatenating with ffmpeg
 */
async function synthToWav(text, modelPath, outFile) {
    const parts = splitIntoTwo(text);
    if (parts.length === 1) { 
        await runPiper(parts[0], modelPath, outFile); 
        return; 
    }
    
    const tmpDir = `/tmp/piper_${Date.now()}`;
    fs.mkdirSync(tmpDir, { recursive: true });
    
    const seg1 = path.join(tmpDir, "part1.wav");
    const seg2 = path.join(tmpDir, "part2.wav");
    
    await runPiper(parts[0], modelPath, seg1);
    await runPiper(parts[1], modelPath, seg2);
    
    const list = path.join(tmpDir, "list.txt");
    fs.writeFileSync(list, `file '${seg1}'\nfile '${seg2}'\n`);
    
    const r = spawnSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', outFile], { stdio: 'inherit' });
    
    fs.rmSync(tmpDir, { recursive: true, force: true });
    
    if (r.status !== 0) throw new Error('ffmpeg concat failed');
}

async function generateAudioWithPiper(text, hintLang) {
    const { modelPath, language } = await getModelForLanguage(text, hintLang);
    const tempFilePath = path.join('/tmp', `piper_out_${Date.now()}_${Math.floor(Math.random()*1000)}.wav`);
  
    try {
      await synthToWav(text, modelPath, tempFilePath);
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

// Server limits: Concurrency, Rate-limit, Queue, Timeout
const MAX_CONCURRENCY = Number(process.env.MAX_CONCURRENCY || 2);
const QUEUE_MAX = Number(process.env.QUEUE_MAX || 20);
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS || 600000); // 10 minutes
const PER_MIN = Number(process.env.RATE_LIMIT_PER_LICENSE_PER_MIN || 6);

let running = 0;
const q = []; // [{fn, res, rej, deadline}]
const rl = new Map(); // license_key -> {ts, count}

/**
 * Rate limit check per license key (requests per minute)
 */
function rateLimit(license) {
    const key = String(license || 'anon');
    const now = Date.now();
    const win = 60 * 1000;
    const r = rl.get(key) || { ts: now, count: 0 };
    if (now - r.ts > win) { 
        r.ts = now; 
        r.count = 0; 
    }
    if (r.count >= PER_MIN) return false;
    r.count++; 
    rl.set(key, r); 
    return true;
}

/**
 * Schedule a job with concurrency control and queue
 */
function schedule(jobFn) {
    return new Promise((res, rej) => {
        if (running < MAX_CONCURRENCY) { 
            running++; 
            jobFn().then(res, rej).finally(() => { 
                running--; 
                pump(); 
            }); 
        } else if (q.length < QUEUE_MAX) { 
            q.push({ fn: jobFn, res, rej }); 
        } else {
            rej(new Error('Busy: try again later'));
        }
    });
}

/**
 * Process queue when capacity becomes available
 */
function pump() { 
    while (running < MAX_CONCURRENCY && q.length) { 
        const j = q.shift(); 
        running++; 
        j.fn().then(j.res, j.rej).finally(() => { 
            running--; 
            pump(); 
        }); 
    } 
}

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
        const { text, post_id, wp_post_id, license_key, language } = req.body || {};
        const effectivePostId = wp_post_id || post_id;
        
        // Validate input
        if (!license_key || !text) {
            return res.status(400).json({ error: 'Missing license_key or text' });
        }
        
        if (!effectivePostId) {
            return res.status(400).json({ error: 'post_id is required' });
        }
        
        if (typeof text !== 'string' || text.trim().length === 0) {
            return res.status(400).json({ error: 'Text must be a non-empty string' });
        }
        
        // Step 1: Rate limit check
        if (!rateLimit(license_key)) {
            return res.status(429).json({ error: 'Too many requests, slow down.' });
        }
        
        // Step 2: Validate license with Freemius (או מצב בדיקה)
        let validation;
        const isTestKey = license_key === 'TEST' || license_key === TEST_LICENSE_KEY;
        const shouldSkipValidation = TEST_MODE || isTestKey;
        
        if (shouldSkipValidation) {
            if (TEST_MODE) {
                console.log('⚠️  TEST MODE: Skipping Freemius validation (Freemius is disabled)');
            } else {
                console.log('⚠️  TEST KEY detected: Skipping Freemius validation');
            }
            validation = {
                valid: true,
                license: { is_active: true, test_mode: true }
            };
        } else {
            // Try to load from cache first (validated within last 24 hours)
            const cachedLicense = await loadLicenseFromDB(license_key);
            
            if (cachedLicense && cachedLicense.is_active) {
                // Use cached license info
                validation = {
                    valid: true,
                    license: {
                        is_active: cachedLicense.is_active,
                        plan: { name: cachedLicense.plan },
                        expiration: cachedLicense.expires_at ? Math.floor(new Date(cachedLicense.expires_at).getTime() / 1000) : null,
                        user_id: cachedLicense.freemius_user_id,
                        id: cachedLicense.freemius_license_id
                    }
                };
                console.log(`Using cached license for: ${license_key.substring(0, 8)}... (plan: ${cachedLicense.plan})`);
            } else {
                // Validate with Freemius API
                console.log(`Validating license: ${license_key.substring(0, 8)}...`);
                validation = await validateFreemiusLicense(license_key);
                
                if (!validation.valid) {
                    return res.status(403).json({
                        error: validation.error || 'Invalid or expired license'
                    });
                }
                
                // Save license info to database for caching and future queries
                await saveLicenseToDB(license_key, validation);
            }
        }
        
        // Step 2.5: If DB is configured, use DB-first enforcement (licenses/usage_month)
        if (dbPool) {
            const licRow = await getOrValidateLicense(license_key);
            if (!licRow || !['trialing','active'].includes(licRow.status)) {
                return res.status(403).json({ error: 'Invalid or inactive license' });
            }
            const planCode = licRow.plan_code || 'trial';
            const conn = await dbPool.getConnection();
            try {
                await conn.beginTransaction();
                if (planCode === 'trial') {
                    if (!licRow.trial_post_id) {
                        await conn.query(`UPDATE \`${DB_LICENSES_TABLE}\` SET trial_post_id=? WHERE license_key=?`, [effectivePostId, license_key]);
                    } else if (String(licRow.trial_post_id) !== String(effectivePostId)) {
                        await conn.rollback();
                        return res.status(402).json({ error: 'Trial locked to another post' });
                    }
                }
                const month = new Date().toISOString().slice(0, 7);
                await conn.query(`INSERT IGNORE INTO \`${DB_TABLE_NAME}\` (license_key, month) VALUES (?, ?)`, [license_key, month]);
                const row = await jsonSearchPost(conn, license_key, month, effectivePostId);
                const already = !!row && row.found !== null;
                if (!already) {
                    const limit = { trial:1, starter:50, creator:150, pro:500, agency:2000, unlimited:Number.MAX_SAFE_INTEGER }[planCode] ?? 1;
                    const usedCount = Number(row?.posts_used_count) || 0;
                    if (usedCount >= limit) {
                        await conn.rollback();
                        return res.status(402).json({ error: 'Monthly post quota exceeded for plan' });
                    }
                    await appendPostUsed(conn, license_key, month, effectivePostId);
                }
                await conn.commit();
            } catch (e) {
                try { await conn.rollback(); } catch(_) {}
                throw e;
            } finally {
                conn.release();
            }
        }

        // Step 3: Get usage and check post-based limits (fallback memory)
        const plan = resolvePlan(validation);
        const usage = await getUsage(license_key, plan);
        
        // Determine if user has paid plan
        const hasPaid = plan !== 'trial' && !validation.license?.test_mode;
        
        // Trial logic (אם אין תכנית בתשלום)
        if (!hasPaid) {
            if (!usage.trial_post_id) {
                usage.trial_post_id = String(effectivePostId);
            }
            if (String(effectivePostId) !== usage.trial_post_id) {
                return res.status(402).json({ 
                    error: 'ניצלת את הפוסט החינמי. נא לרכוש תכנית.' 
                });
            }
        }
        
        // מכסה לפי פוסטים/חודש לתוכניות בתשלום
        if (hasPaid) {
            const limit = getPlanLimit(plan);
            const alreadyUsed = usage.posts_used.has(String(effectivePostId));
            const usedCount = usage.posts_used.size;
            
            if (!alreadyUsed && isFinite(limit) && usedCount >= limit) {
                return res.status(429).json({ 
                    error: 'המכסה החודשית בפוסטים נוצלה', 
                    plan, 
                    used: usedCount, 
                    limit 
                });
            }
        }
        
        // Step 4: Get model for language
        const { modelPath, language: chosenLanguage } = await getModelForLanguage(text, language || null);
        const tempFilePath = path.join('/tmp', `piper_out_${Date.now()}_${Math.floor(Math.random()*1000)}.wav`);
        
        // Step 5: Schedule audio generation with concurrency control and timeout
        try {
            const job = () => new Promise(async (resolve, reject) => {
                const tm = setTimeout(() => reject(new Error('Job timeout')), JOB_TIMEOUT_MS);
                try {
                    await synthToWav(text, modelPath, tempFilePath);
                    clearTimeout(tm);
                    resolve();
                } catch (e) { 
                    clearTimeout(tm); 
                    reject(e); 
                }
            });
            
            await schedule(job);
            
            // Read generated audio
            const audioBuffer = fs.readFileSync(tempFilePath);
            
            if (!audioBuffer || audioBuffer.length === 0) {
                console.error('Generated audio buffer is empty');
                return res.status(500).json({
                    error: 'Generated audio is empty'
                });
            }
            
            // Step 6: Update usage counters (DB-first)
            const textLen = (text || '').length;
            if (dbPool) {
                try {
                    await incrementUsageCountersDB(license_key, textLen);
                } catch (_) {}
            } else {
                if (!usage.posts_used.has(String(effectivePostId))) usage.posts_used.add(String(effectivePostId));
                usage.generate_count += 1;
                usage.chars_used += textLen;
                usage.plan = plan;
                await updateUsage(license_key, usage);
            }
            
            // Step 7: Return success response with audio data
            const audioBase64 = audioBuffer.toString('base64');
            
            res.json({
                ok: true,
                language: chosenLanguage,
                audio_data: audioBase64,
                audio_mime: 'audio/wav',
                filename: `audio_${Date.now()}.wav`,
                usage: dbPool ? undefined : {
                    plan: resolvePlan(validation),
                    used_posts: usage.posts_used.size,
                    limit_posts: getPlanLimit(resolvePlan(validation)),
                    remaining_posts: isFinite(getPlanLimit(resolvePlan(validation))) ? Math.max(0, getPlanLimit(resolvePlan(validation)) - usage.posts_used.size) : Infinity,
                    generate_count: usage.generate_count
                }
            });
            
        } catch (audioError) {
            console.error('Audio generation failed:', audioError);
            
            // Check if timeout error
            if (audioError.message === 'Busy: try again later') {
                return res.status(429).json({
                    error: audioError.message
                });
            }
            
            return res.status(500).json({
                error: audioError.message || 'Failed to generate audio'
            });
        } finally {
            // Cleanup temp file
            if (fs.existsSync(tempFilePath)) {
                fs.unlink(tempFilePath, () => {});
            }
        }
        
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
        
        // Try to load from DB first, fallback to cache
        if (dbPool) {
            try {
                const [rows] = await dbPool.query(
                    `SELECT * FROM \`${DB_TABLE_NAME}\` WHERE month = ?`,
                    [currentMonth]
                );
                
                for (const row of rows) {
                    const postsUsedArray = JSON.parse(row.posts_used || '[]');
                    stats.push({
                        license_key: row.license_key.substring(0, 8) + '...',
                        month: row.month,
                        posts_used: postsUsedArray.length,
                        generate_count: row.generate_count || 0,
                        trial_post_id: row.trial_post_id || null,
                        chars_used: row.chars_used || 0,
                        plan: row.plan || null
                    });
                }
            } catch (error) {
                console.error('Error loading stats from DB:', error.message);
                // Fallback to cache
            }
        }
        
        // Fallback to cache if DB failed or not available
        if (stats.length === 0) {
            for (const [cacheKey, usage] of (global.usageDB || new Map()).entries()) {
                if (usage.month === currentMonth) {
                    const licenseKey = cacheKey.split('_')[0]; // Extract license_key from cache key
                    stats.push({
                        license_key: licenseKey.substring(0, 8) + '...',
                        month: usage.month,
                        posts_used: usage.posts_used ? usage.posts_used.size : 0,
                        generate_count: usage.generate_count || 0,
                        trial_post_id: usage.trial_post_id || null,
                        chars_used: usage.chars_used || 0,
                        plan: usage.plan || null
                    });
                }
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
        let validation;
        const isTestKey = license_key === 'TEST' || license_key === TEST_LICENSE_KEY;
        const shouldSkipValidation = TEST_MODE || isTestKey;
        
        if (shouldSkipValidation) {
            validation = {
                valid: true,
                license: { is_active: true, test_mode: true }
            };
        } else {
            // Try to load from cache first
            const cachedLicense = await loadLicenseFromDB(license_key);
            
            if (cachedLicense && cachedLicense.is_active) {
                validation = {
                    valid: true,
                    license: {
                        is_active: cachedLicense.is_active,
                        plan: { name: cachedLicense.plan },
                        expiration: cachedLicense.expires_at ? Math.floor(new Date(cachedLicense.expires_at).getTime() / 1000) : null
                    }
                };
            } else {
                validation = await validateFreemiusLicense(license_key);
                
                if (!validation.valid) {
                    return res.status(403).json({
                        error: 'Invalid or expired license'
                    });
                }
                
                // Save license info to database
                await saveLicenseToDB(license_key, validation);
            }
        }
        
        // Get usage
        const plan = resolvePlan(validation);
        const usage = await getUsage(license_key, plan);
        const limit = getPlanLimit(plan);
        
        res.json({
            month: usage.month,
            plan: plan,
            used_posts: usage.posts_used ? usage.posts_used.size : 0,
            limit_posts: limit,
            remaining_posts: isFinite(limit) ? Math.max(0, limit - (usage.posts_used ? usage.posts_used.size : 0)) : Infinity,
            generate_count: usage.generate_count || 0,
            trial_post_id: usage.trial_post_id || null
        });
        
    } catch (error) {
        console.error('Error in /usage:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});

/**
 * Database setup/migration endpoint - creates tables and columns if needed
 */
app.post('/admin/setup-database', async (req, res) => {
    try {
        // Simple authentication
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== process.env.ADMIN_KEY) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const result = await initDatabase();
        
        if (result) {
            res.json({
                success: true,
                message: 'Database initialized successfully',
                database: DB_CONFIG.database,
                tables: {
                    licenses: DB_LICENSES_TABLE,
                    usage_month: DB_TABLE_NAME
                },
                note: 'Both tables created: licenses (license_key, plan_code, status, period, trial_post_id, etc.) and usage_month (monthly usage tracking with JSON posts_used)'
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Database initialization failed. Check server logs.',
                note: 'Server will continue using in-memory storage'
            });
        }
    } catch (error) {
        console.error('Error in /admin/setup-database:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});

/**
 * Database status endpoint - check if database is configured
 */
app.get('/admin/database-status', async (req, res) => {
    try {
        // Simple authentication
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== process.env.ADMIN_KEY) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        if (!dbPool) {
            return res.json({
                connected: false,
                message: 'Database not connected. Using in-memory storage.',
                config: {
                    host: DB_CONFIG.host,
                    database: DB_CONFIG.database,
                    table: DB_TABLE_NAME
                }
            });
        }
        
        // Test connection and check table
        try {
            const [rows] = await dbPool.query(`SHOW TABLES LIKE '${DB_TABLE_NAME}'`);
            const tableExists = rows.length > 0;
            
            if (tableExists) {
                const [columns] = await dbPool.query(`DESCRIBE \`${DB_TABLE_NAME}\``);
                const [count] = await dbPool.query(`SELECT COUNT(*) as total FROM \`${DB_TABLE_NAME}\``);
                
                return res.json({
                    connected: true,
                    table_exists: true,
                    table: DB_TABLE_NAME,
                    database: DB_CONFIG.database,
                    columns: columns.map(col => ({
                        name: col.Field,
                        type: col.Type,
                        null: col.Null,
                        key: col.Key,
                        default: col.Default
                    })),
                    record_count: count[0]?.total || 0
                });
            } else {
                return res.json({
                    connected: true,
                    table_exists: false,
                    table: DB_TABLE_NAME,
                    database: DB_CONFIG.database,
                    message: 'Table does not exist. Run /admin/setup-database to create it.'
                });
            }
        } catch (error) {
            return res.status(500).json({
                connected: false,
                error: error.message,
                message: 'Error checking database status'
            });
        }
    } catch (error) {
        console.error('Error in /admin/database-status:', error);
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

// Initialize database on startup (non-blocking)
initDatabase().then(success => {
    if (success) {
        console.log(`✅ Database connected: ${DB_CONFIG.database}.${DB_TABLE_NAME}`);
    } else {
        console.log('⚠️  Database connection failed - using in-memory storage');
        console.log('   To set up database, configure DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in .env');
        console.log('   Then call POST /admin/setup-database with x-admin-key header');
    }
});

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
    console.log('📊 Database Setup:');
    console.log('   POST /admin/setup-database - Create database tables');
    console.log('   GET  /admin/database-status - Check database connection');
    console.log('');
});

