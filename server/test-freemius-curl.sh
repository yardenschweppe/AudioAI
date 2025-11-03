#!/bin/bash

# Freemius API Manual Testing with cURL
# This script generates curl commands for testing Freemius API endpoints

# Configuration (load from .env or use defaults)
FREEMIUS_PRODUCT_ID="${FREEMIUS_PRODUCT_ID:-21493}"
FREEMIUS_API_KEY="${FREEMIUS_API_KEY:-322d2192e469bde7e0d0c3fe33afe543}"
FREEMIUS_SECRET_KEY="${FREEMIUS_SECRET_KEY:-sk_0MMUBME@.WS)<IG1GLBsW(~w<0b)X}"
FREEMIUS_PUBLIC_KEY="${FREEMIUS_PUBLIC_KEY:-pk_c1f4731e093f2279f624161d5ee8b}"

# Test license key (pass as first argument)
TEST_LICENSE_KEY="${1:-sk_S-7*x...}"

BASE_URL="https://api.freemius.com/v1"

echo "🧪 Freemius API Manual Testing with cURL"
echo ""
echo "Configuration:"
echo "  Product ID: $FREEMIUS_PRODUCT_ID"
echo "  API Key: ${FREEMIUS_API_KEY:0:10}..."
echo "  Public Key: ${FREEMIUS_PUBLIC_KEY:0:10}..."
echo "  Secret Key: ${FREEMIUS_SECRET_KEY:0:10}..."
echo "  License Key: ${TEST_LICENSE_KEY:0:8}..."
echo ""
echo "⚠️  Note: This script shows the curl commands."
echo "   For actual testing, use test-freemius-api.js which generates proper FS signatures."
echo ""
echo "================================================================================"
echo ""

# Note: Freemius uses HMAC-SHA256 signatures with specific format
# The Node.js script handles this correctly. For curl, you'd need to generate the signature.
# Here are the curl command templates (you'll need to generate the auth headers):

echo "Test 1: POST /plugins/$FREEMIUS_PRODUCT_ID/licenses.json"
echo "curl -X POST '$BASE_URL/plugins/$FREEMIUS_PRODUCT_ID/licenses.json' \\"
echo "  -H 'Accept: application/json' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H 'Date: $(date -u +"%a, %d %b %Y %H:%M:%S %z")' \\"
echo "  -H 'Authorization: FS [GENERATED_SIGNATURE]' \\"
echo "  -d '{\"license_key\":\"$TEST_LICENSE_KEY\"}'"
echo ""

echo "Test 2: POST /licenses/validate.json"
echo "curl -X POST '$BASE_URL/licenses/validate.json' \\"
echo "  -H 'Accept: application/json' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H 'Date: $(date -u +"%a, %d %b %Y %H:%M:%S %z")' \\"
echo "  -H 'Authorization: FS [GENERATED_SIGNATURE]' \\"
echo "  -d '{\"plugin_id\":\"$FREEMIUS_PRODUCT_ID\",\"license_key\":\"$TEST_LICENSE_KEY\"}'"
echo ""

echo "Test 3: GET /plugins/$FREEMIUS_PRODUCT_ID/licenses.json?license_key=..."
echo "curl -X GET '$BASE_URL/plugins/$FREEMIUS_PRODUCT_ID/licenses.json?license_key=$(echo -n "$TEST_LICENSE_KEY" | jq -sRr @uri)' \\"
echo "  -H 'Accept: application/json' \\"
echo "  -H 'Date: $(date -u +"%a, %d %b %Y %H:%M:%S %z")' \\"
echo "  -H 'Authorization: FS [GENERATED_SIGNATURE]'"
echo ""

echo "================================================================================"
echo ""
echo "⚠️  IMPORTANT: The Authorization header requires HMAC-SHA256 signature generation."
echo "   Use test-freemius-api.js instead for proper signature generation."
echo ""
echo "To run the Node.js test script:"
echo "  cd server"
echo "  node test-freemius-api.js [LICENSE_KEY]"
echo ""

