#!/usr/bin/env node

/**
 * Test Freemius API manually with curl-like commands
 * This script helps test different endpoint variations to find the correct one
 */

const crypto = require('crypto');
const axios = require('axios');

// Load configuration from environment or use defaults
require('dotenv').config();

const FREEMIUS_PRODUCT_ID = process.env.FREEMIUS_PRODUCT_ID || process.env.FREEMIUS_PLUGIN_ID || '21493';
const FREEMIUS_API_KEY = process.env.FREEMIUS_API_KEY || '322d2192e469bde7e0d0c3fe33afe543';
const FREEMIUS_SECRET_KEY = process.env.FREEMIUS_SECRET_KEY || 'sk_0MMUBME@.WS)<IG1GLBsW(~w<0b)X';
const FREEMIUS_PUBLIC_KEY = process.env.FREEMIUS_PUBLIC_KEY || 'pk_c1f4731e093f2279f624161d5ee8b';

// Test license key (replace with a real one for testing)
const TEST_LICENSE_KEY = process.argv[2] || 'sk_S-7*x...'; // Use first argument or default

/**
 * Generate Freemius authorization header (FS signature)
 * Based on Freemius SDK implementation
 */
function generateFreemiusAuth(method, resourceUrl, postParams = '') {
    const methodUpper = method.toUpperCase();
    const eol = '\n';
    let contentMd5 = '';
    let contentType = '';
    
    // Format date exactly like @freemius/sdk toDateTimeString() does
    // Format: "YYYY-MM-DD HH:MM:SS" (not RFC 2822!)
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const hours = String(now.getUTCHours()).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    const seconds = String(now.getUTCSeconds()).padStart(2, '0');
    const date = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    
    if (['POST', 'PUT'].includes(methodUpper)) {
        contentType = 'application/json';
        if (postParams) {
            // MD5 hash as hex string (like PHP md5())
            contentMd5 = crypto.createHash('md5').update(postParams, 'utf8').digest('hex');
        }
    }
    
    // String to sign format: METHOD\nCONTENT_MD5\nCONTENT_TYPE\nDATE\nRESOURCE_URL
    const stringToSign = [
        methodUpper,
        contentMd5,
        contentType,
        date,
        resourceUrl
    ].join(eol);
    
    // Determine auth type (FS or FSP)
    const authType = FREEMIUS_SECRET_KEY !== FREEMIUS_PUBLIC_KEY ? 'FS' : 'FSP';
    
    // Generate HMAC signature - exactly like @freemius/sdk does it
    // 1. HMAC-SHA256 -> hex string
    const signatureHex = crypto.createHmac('sha256', FREEMIUS_SECRET_KEY).update(stringToSign).digest('hex');
    
    // 2. Base64UrlEncode the hex string (treat hex as UTF-8 string, then base64 encode)
    // This matches the SDK's base64UrlEncode function:
    // Buffer.from(input, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    const signature = Buffer.from(signatureHex, 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, ''); // Remove trailing = padding
    
    const authorization = `${authType} ${FREEMIUS_PRODUCT_ID}:${FREEMIUS_PUBLIC_KEY}:${signature}`;
    
    return {
        date,
        authorization,
        contentMd5: contentMd5 || undefined
    };
}

/**
 * Test an endpoint with the given method and body
 * @param {string} method - HTTP method
 * @param {string} endpoint - Full endpoint with query params if any
 * @param {object} body - Request body (for POST)
 * @param {string} resourceUrlForSignature - Optional: resource URL for signature (without query params)
 */
async function testEndpoint(method, endpoint, body = null, resourceUrlForSignature = null, queryParams = null) {
    const baseUrl = 'https://api.freemius.com/v1';
    
    // Add query params if provided
    let fullUrl = `${baseUrl}${endpoint}`;
    if (queryParams) {
        const params = new URLSearchParams();
        Object.entries(queryParams).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                params.append(key, value);
            }
        });
        const queryString = params.toString();
        if (queryString) {
            fullUrl += (endpoint.includes('?') ? '&' : '?') + queryString;
        }
    }
    
    const bodyString = body ? JSON.stringify(body) : '';
    
    // For signature, use resourceUrl without query params if provided, otherwise use endpoint
    const resourceUrl = resourceUrlForSignature || endpoint.split('?')[0];
    
    // The SDK uses Bearer token (API_KEY) for API calls, not FS signature
    // FS signature is only for signed URLs
    const headers = {
        'Accept': 'application/json',
        'Authorization': `Bearer ${FREEMIUS_API_KEY}`,
        'User-Agent': `Freemius-JS-SDK-Test/1.0 (Node.js)`
    };
    
    if (body) {
        headers['Content-Type'] = 'application/json';
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Testing: ${method} ${fullUrl}`);
    console.log(`Headers:`, JSON.stringify(headers, null, 2));
    if (body) {
        console.log(`Body:`, JSON.stringify(body, null, 2));
    }
    console.log(`${'='.repeat(80)}\n`);
    
    try {
        const config = {
            method: method.toLowerCase(),
            url: fullUrl,
            headers,
            data: bodyString || undefined,
            timeout: 10000
        };
        
        const response = await axios(config);
        
        console.log(`✅ SUCCESS! Status: ${response.status}`);
        console.log(`Response:`, JSON.stringify(response.data, null, 2));
        return { success: true, response: response.data, status: response.status };
    } catch (error) {
        console.log(`❌ ERROR! Status: ${error.response?.status || 'N/A'}`);
        if (error.response) {
            console.log(`Response:`, JSON.stringify(error.response.data, null, 2));
            return { 
                success: false, 
                error: error.response.data, 
                status: error.response.status 
            };
        } else {
            console.log(`Error:`, error.message);
            return { success: false, error: error.message };
        }
    }
}

/**
 * Main test function
 */
async function main() {
    console.log('\n🧪 Freemius API Manual Testing Tool\n');
    console.log(`Product ID: ${FREEMIUS_PRODUCT_ID}`);
    console.log(`API Key: ${FREEMIUS_API_KEY.substring(0, 10)}...`);
    console.log(`Public Key: ${FREEMIUS_PUBLIC_KEY.substring(0, 10)}...`);
    console.log(`Secret Key: ${FREEMIUS_SECRET_KEY.substring(0, 10)}...`);
    console.log(`License Key: ${TEST_LICENSE_KEY.substring(0, 8)}...`);
    console.log('\n');
    
    const results = [];
    
    // Test 1: POST to /products/{id}/licenses.json with license_key in body
    // Note: The correct endpoint is /products/ not /plugins/
    console.log('📋 Test 1: POST /products/{id}/licenses.json');
    results.push(await testEndpoint(
        'POST',
        `/products/${FREEMIUS_PRODUCT_ID}/licenses.json`,
        { license_key: TEST_LICENSE_KEY }
    ));
    
    // Test 2: POST to /licenses/validate.json with plugin_id and license_key
    console.log('\n📋 Test 2: POST /licenses/validate.json');
    results.push(await testEndpoint(
        'POST',
        `/licenses/validate.json`,
        { 
            plugin_id: FREEMIUS_PRODUCT_ID,
            license_key: TEST_LICENSE_KEY 
        }
    ));
    
    // Test 3: GET to /products/{id}/licenses.json with license_key as query param
    // Note: For GET with query params, the resourceUrl in signature should NOT include query params
    // The query params are part of the URL but not part of the signature
    console.log('\n📋 Test 3: GET /products/{id}/licenses.json?license_key=...');
    // For signature, use path without query params
    const pathWithoutQuery = `/products/${FREEMIUS_PRODUCT_ID}/licenses.json`;
    const queryParams = `?license_key=${encodeURIComponent(TEST_LICENSE_KEY)}`;
    // We'll need to modify testEndpoint to handle this case
    results.push(await testEndpoint(
        'GET',
        pathWithoutQuery + queryParams,
        null,
        pathWithoutQuery // resourceUrl for signature (without query params)
    ));
    
    // Test 4: GET to /products/{id}/licenses.json (list all licenses)
    console.log('\n📋 Test 4: GET /products/{id}/licenses.json (list all)');
    results.push(await testEndpoint(
        'GET',
        `/products/${FREEMIUS_PRODUCT_ID}/licenses.json`
    ));
    
    // Test 5: GET to /products/{id}/licenses/{license_id}.json (get specific license)
    // This requires a license_id, but we can test with a license_key filter
    console.log('\n📋 Test 5: GET /products/{id}/licenses.json with filter');
    results.push(await testEndpoint(
        'GET',
        `/products/${FREEMIUS_PRODUCT_ID}/licenses.json`,
        null,
        null,
        { license_key: TEST_LICENSE_KEY } // As query param
    ));
    
    // Summary
    console.log('\n\n📊 SUMMARY:\n');
    results.forEach((result, index) => {
        const status = result.success ? '✅' : '❌';
        console.log(`${status} Test ${index + 1}: ${result.status || 'N/A'}`);
    });
    
    const successful = results.find(r => r.success);
    if (successful) {
        console.log(`\n🎉 Found working endpoint! Check test ${results.indexOf(successful) + 1} above.`);
    } else {
        console.log(`\n⚠️  No working endpoint found. All tests failed.`);
        console.log(`\n📝 Possible issues:`);
        console.log(`   1. Invalid Authorization header (401) - The FS signature might be incorrect`);
        console.log(`      - Note: The SDK uses Bearer token (API_KEY) for /products/ endpoints`);
        console.log(`      - FS signature is only for signed URLs, not regular API calls`);
        console.log(`      - Verify that API_KEY is correct (should be a Bearer token)`);
        console.log(`      - Check if you need Developer ID instead of Product ID`);
        console.log(`   2. Invalid request path (400) - The endpoint doesn't exist`);
        console.log(`      - Check Freemius API documentation for correct endpoints`);
        console.log(`      - Contact Freemius support to confirm the license validation endpoint`);
        console.log(`\n💡 Next steps:`);
        console.log(`   - Check the @freemius/sdk source code to see how it generates auth headers`);
        console.log(`   - Try using the SDK directly instead of manual API calls`);
        console.log(`   - Verify credentials in Freemius developer dashboard`);
    }
}

// Run tests
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});

