# VOD Server Deployment Guide

This guide explains how to deploy the VOD HTTP server on the VOD module machine (10.66.1.76).

## Prerequisites

- Node.js installed on the VOD machine
- Access to the VOD machine via SSH
- Permissions to write to `/usr/local/var/vod-maps/`

## Installation Steps

### 1. Copy Server File to VOD Machine

```bash
scp vod-server.js user@10.66.1.76:/opt/vod-server/
```

### 2. Install Dependencies on VOD Machine

```bash
ssh user@10.66.1.76
cd /opt/vod-server
npm init -y
npm install express
```

### 3. Create VOD Maps Directory

```bash
sudo mkdir -p /usr/local/var/vod-maps
sudo chmod 755 /usr/local/var/vod-maps
```

### 4. Run Server (Development)

```bash
# Run directly (will stop when SSH session ends)
node vod-server.js
```

### 5. Run as Service (Production)

#### Option A: Using PM2 (Recommended)

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the service
pm2 start vod-server.js --name vod-api

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions provided by the command above

# Check status
pm2 status
pm2 logs vod-api
```

#### Option B: Using systemd

Create service file `/etc/systemd/system/vod-server.service`:

```ini
[Unit]
Description=VOD Module HTTP Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/vod-server
ExecStart=/usr/bin/node vod-server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=80
Environment=VOD_MAPS_DIR=/usr/local/var/vod-maps

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable vod-server
sudo systemctl start vod-server
sudo systemctl status vod-server
```

## Configuration

### Environment Variables

- `PORT` - Server port (default: 80)
- `VOD_MAPS_DIR` - Directory for VOD maps (default: /usr/local/var/vod-maps)

### Example

```bash
PORT=8080 VOD_MAPS_DIR=/var/vod node vod-server.js
```

## API Endpoints

### Health Check
```
GET /health
```

### List All VOD Maps
```
GET /api/vod-maps
```

### Get Specific VOD Map
```
GET /api/vod-maps/{filename}.json
```

### Create/Update VOD Map
```
POST /api/vod-maps/{filename}.json
Content-Type: application/json

{
  "cache": false,
  "durations": [10000],
  "sequences": [{
    "clips": [
      {
        "type": "source",
        "path": "wfapi/backup/files/sources/...",
        "clipFrom": 0
      }
    ]
  }]
}
```

### Delete VOD Map
```
DELETE /api/vod-maps/{filename}.json
```

### Delete ALL VOD Maps (Clear Folder)
```
DELETE /api/vod-maps
```

Response:
```json
{
  "success": true,
  "deletedCount": 5,
  "timestamp": "2025-12-02T17:00:00.000Z"
}
```

**Note:** The React app automatically clears all existing VOD maps before generating new ones, so the folder always contains only the latest generated playlists.

## Testing

### Test from command line:

```bash
# Health check
curl http://10.66.1.76/health

# Create a test VOD map
curl -X POST http://10.66.1.76/api/vod-maps/test.json \
  -H "Content-Type: application/json" \
  -d '{
    "cache": false,
    "durations": [10000],
    "sequences": [{
      "clips": [{
        "type": "source",
        "path": "wfapi/backup/files/sources/test.mp4",
        "clipFrom": 0
      }]
    }]
  }'

# List all maps
curl http://10.66.1.76/api/vod-maps

# Get specific map
curl http://10.66.1.76/api/vod-maps/test.json
```

## Troubleshooting

### Check if server is running
```bash
pm2 status
# or
sudo systemctl status vod-server
```

### View logs
```bash
pm2 logs vod-api
# or
sudo journalctl -u vod-server -f
```

### Check port binding
```bash
sudo netstat -tlnp | grep :80
```

### Verify directory permissions
```bash
ls -la /usr/local/var/vod-maps
```

### Test connectivity from React app machine
```bash
curl http://10.66.1.76/health
```

## Security Notes

- The server allows CORS from any origin (for development)
- For production, consider restricting CORS to specific origins
- Consider adding authentication if needed
- Ensure firewall allows connections on port 80

