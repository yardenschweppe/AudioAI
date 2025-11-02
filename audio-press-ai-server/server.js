const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
// טעינת ESM דינמית מתוך CommonJS
// טעינת ESM franc-min מתוך CommonJS
let _franc;
async function detectISO3(text) {
  if (!_franc) _franc = (await import('franc-min')).default;
  return _franc(text || '', { minLength: 10 });
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
const MONTHLY_CHAR_LIMIT = 200000; // 200K characters per month

// Development/Test Mode - מאפשר לנסות בלי Freemius
// הגדר TEST_MODE=true ב-.env או הפעל עם NODE_ENV=development כדי לדלג על בדיקת Freemius לחלוטין
// ב-TEST_MODE, השרת לא ינסה להתחבר ל-Freemius API בכלל
const TEST_MODE = process.env.TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
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

// In-memory database for metering (in production, use Redis or PostgreSQL)
const usageDB = new Map(); // license_key -> { month: '2025-01', chars_used: 0, generate_count: 0, wp_user_ids: Set() }

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
 * Detect language from text using franc-min library (professional LID)
 * Returns language code compatible with our Piper models
 * 
 * franc-min returns ISO 639-3 codes, we map them to our language codes:
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
 */
// Async language detection using franc-min (ESM) via detectISO3()
// hintLang can be 'pt_PT', 'pt_BR', 'nl_BE' etc.
async function detectLanguage(text, hintLang) {
    const cleanText = (text || '').trim().replace(/\s+/g, ' ');
    const iso3 = cleanText.length < 10 ? 'eng' : await detectISO3(cleanText);
  
    // Map ISO-639-3 -> our Piper keys
    let lang = ({
      eng: 'en',
      spa: 'es',
      deu: 'de',
      nld: 'nl_NL',
      por: 'pt_BR',
      heb: 'he',
      ara: 'ar',
      rus: 'ru',
      cmn: 'zh',
      zho: 'zh',
      jpn: 'zh',
      kor: 'zh',
    })[iso3] || 'en';
  
    // Respect client hint for dialects
    if (lang === 'pt_BR' && hintLang) {
      const h = hintLang.replace('-', '_');
      if (h === 'pt_PT' || h === 'pt_BR') lang = h;
    }
    if (lang === 'nl_NL' && hintLang) {
      const h = hintLang.replace('-', '_');
      if (h === 'nl_BE' || h === 'nl_NL') lang = h;
    }
  
    return lang;
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
        const { license_key, wp_user_id, text, model, voice, language } = req.body;
        
        // Validate input
        if (!license_key || !text) {
            return res.status(400).json({ error: 'Missing license_key or text' });
        }
        
        if (typeof text !== 'string' || text.trim().length === 0) {
            return res.status(400).json({ error: 'Text must be a non-empty string' });
        }
        
        const textLength = text.length;
        
        // Step 1: Validate license with Freemius (או מצב בדיקה)
        console.log(`Validating license: ${license_key.substring(0, 8)}...`);
        
        // מצב בדיקה - דלג על בדיקת Freemius אם זה TEST_MODE
        // ב-TEST_MODE, אנחנו לא מנסים להתחבר ל-Freemius בכלל
        let validation;
        if (TEST_MODE) {
            console.log('⚠️  TEST MODE: Skipping Freemius validation (Freemius is disabled)');
            validation = {
                valid: true,
                license: { is_active: true, test_mode: true }
            };
        } else {
            validation = await validateFreemiusLicense(license_key);
            
            if (!validation.valid) {
                return res.status(403).json({
                    error: validation.error || 'Invalid or expired license'
                });
            }
        }
        
        // Step 2: Check metering (monthly character limit)
        const usage = checkAndUpdateUsage(license_key, textLength);
        
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
        
        // Step 2.5: Increment generate counter
        const generateCount = incrementGenerateCount(license_key, wp_user_id);
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
            const usageEntry = usageDB.get(license_key);
            if (usageEntry) {
                usageEntry.chars_used = Math.max(0, usageEntry.chars_used - textLength);
            }
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

