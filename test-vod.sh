#!/bin/bash

# VOD JSON Testing Script
# This script helps test VOD JSON file generation and upload

VOD_URL=${VOD_URL:-"http://10.66.1.76"}
JSON_FILE=${1:-"test_1.json"}

echo "========================================"
echo "  VOD JSON Testing Script"
echo "========================================"
echo "VOD Server: $VOD_URL"
echo "JSON File: $JSON_FILE"
echo ""

# Check if JSON file exists
if [ ! -f "$JSON_FILE" ]; then
    echo "❌ Error: $JSON_FILE not found"
    echo ""
    echo "Creating a sample test file..."
    cat > "$JSON_FILE" << 'EOF'
{
  "cache": false,
  "durations": [10000, 15000, 20000],
  "sequences": [{
    "clips": [
      {
        "type": "source",
        "path": "wfapi/backup/files/sources/2025/11/27/test_file.mp4",
        "clipFrom": 0
      },
      {
        "type": "source",
        "path": "wfapi/backup/files/sources/2025/11/27/test_file.mp4",
        "clipFrom": 30000
      },
      {
        "type": "source",
        "path": "wfapi/backup/files/sources/2025/11/27/test_file.mp4",
        "clipFrom": 60000
      }
    ]
  }]
}
EOF
    echo "✓ Created sample $JSON_FILE"
    echo ""
fi

echo "1. Validating JSON syntax..."
if ! python3 -m json.tool "$JSON_FILE" > /dev/null 2>&1; then
    echo "❌ Invalid JSON syntax"
    exit 1
fi
echo "✓ JSON is valid"
echo ""

echo "2. Checking VOD server health..."
HEALTH=$(curl -s "$VOD_URL/health")
if [ $? -eq 0 ]; then
    echo "✓ VOD server is running"
    echo "   Response: $HEALTH"
else
    echo "❌ Cannot reach VOD server at $VOD_URL"
    echo "   Make sure the VOD server is running:"
    echo "   ssh user@10.66.1.76"
    echo "   pm2 status vod-api"
    exit 1
fi
echo ""

echo "3. Uploading JSON to VOD server..."
RESPONSE=$(curl -s -X POST "$VOD_URL/api/vod-maps/$JSON_FILE" \
  -H "Content-Type: application/json" \
  -d @"$JSON_FILE")

if echo "$RESPONSE" | grep -q '"success":true'; then
    echo "✓ Upload successful"
    echo "   Response: $RESPONSE"
else
    echo "❌ Upload failed"
    echo "   Response: $RESPONSE"
    exit 1
fi
echo ""

echo "4. Verifying file on server..."
VERIFY=$(curl -s "$VOD_URL/api/vod-maps/$JSON_FILE")
if echo "$VERIFY" | grep -q '"success":true'; then
    echo "✓ File verified on server"
else
    echo "❌ File not found on server"
    exit 1
fi
echo ""

echo "5. Listing all VOD maps..."
curl -s "$VOD_URL/api/vod-maps" | python3 -m json.tool
echo ""

echo "========================================"
echo "✓ All tests passed!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Check the file on VOD machine:"
echo "   ssh user@10.66.1.76 'cat /usr/local/var/vod-maps/$JSON_FILE'"
echo ""
echo "2. Use your VOD module software to play the file"
echo ""

