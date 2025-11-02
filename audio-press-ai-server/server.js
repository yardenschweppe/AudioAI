const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
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
const PIPER_MODEL_PATH = '/opt/piper/voices/en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx';
const MONTHLY_CHAR_LIMIT = 200000; // 200K characters per month

// Development/Test Mode - מאפשר לנסות בלי Freemius (השתמש ב-"TEST" כ-license_key)
const TEST_MODE = process.env.TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
const TEST_LICENSE_KEY = 'TEST'; // במקרה של test mode, השתמש ב-"TEST" כ-license_key

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
 * Validate license with Freemius
 */
async function validateFreemiusLicense(licenseKey) {
    try {
        const response = await axios.post(
            `${FREEMIUS_API_URL}/${FREEMIUS_DEVELOPER_ID}/plugins/${FREEMIUS_PLUGIN_ID}/licenses/validate.json`,
            {
                license_key: licenseKey
            },
            {
                auth: {
                    username: FREEMIUS_PUBLIC_KEY,
                    password: FREEMIUS_SECRET_KEY
                }
            }
        );

        return {
            valid: response.data.license && response.data.license.is_active,
            license: response.data.license
        };
    } catch (error) {
        console.error('Freemius validation error:', error.response?.data || error.message);
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
 * Generate audio using OpenAI TTS
 */
/**
 * Generate audio using Piper TTS
 */
async function generateAudioWithPiper(text) {
    return new Promise((resolve, reject) => {
        // 1. יצירת נתיב לקובץ זמני
        // אנו משתמשים בתיקיית /tmp/ שהיא תיקייה סטנדרטית לקבצים זמניים
        const tempFileName = `piper_out_${Date.now()}_${Math.floor(Math.random() * 1000)}.wav`;
        const tempFilePath = path.join('/tmp', tempFileName);

        // 2. טיפול בטקסט עבור פקודת ה-shell
        // טיפול בגרש בודד ('') כדי למנוע שבירת הפקודה
        const escapedText = text.replace(/'/g, "'\\''");

        // 3. בניית הפקודה של Piper
        // אנו משתמשים ב-symlink הגלובלי שיצרנו
        // printf 'escaped_text' | piper --model /path/to/model.onnx --output_file /tmp/tempfile.wav
        const command = `printf '${escapedText}' | /usr/local/bin/piper -m ${PIPER_MODEL_PATH} -f ${tempFilePath}`;

        // 4. הרצת הפקודה
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Piper exec error: ${error}`);
                console.error(`Piper stderr: ${stderr}`);
                return reject(new Error(`Failed to generate audio with Piper: ${stderr || error.message}`));
            }

            // 5. קריאת הקובץ שנוצר
            fs.readFile(tempFilePath, (readError, data) => {
                if (readError) {
                    console.error(`Error reading temp file: ${readError}`);
                    return reject(new Error(`Failed to read generated audio file: ${readError.message}`));
                }

                // 6. מחיקת הקובץ הזמני (ניקיון)
                fs.unlink(tempFilePath, (unlinkError) => {
                    if (unlinkError) {
                        console.error(`Warning: Failed to delete temp file: ${tempFilePath}`);
                    }
                });

                // 7. החזרת הדאטה של האודיו (Buffer)
                console.log(`Piper successfully generated ${data.length} bytes.`);
                resolve(data); // data is a Buffer
            });
        });
    });
}

// Audio files are sent directly to WordPress, no storage function needed

/**
 * Main API endpoint
 */
app.post('/generate', async (req, res) => {
    try {
        const { license_key, wp_user_id, text, model, voice } = req.body;
        
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
        
        // מצב בדיקה - דלג על בדיקת Freemius אם זה TEST_MODE ו-license_key הוא "TEST"
        let validation;
        if (TEST_MODE && license_key === TEST_LICENSE_KEY) {
            console.log('⚠️  TEST MODE: Skipping Freemius validation');
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
        
        // Step 3: Generate audio with OpenAI
        console.log(`Generating audio for ${textLength} characters...`);
        const audioBuffer = await generateAudioWithPiper(text);        
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
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
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
        let validation;
        if (TEST_MODE && license_key === TEST_LICENSE_KEY) {
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Audio-Press AI Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

