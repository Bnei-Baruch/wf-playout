# Environment Variables Configuration

This document describes all environment variables used by the wf-playout application.

## Setup

Create a `.env` file in the project root directory (`/Users/alexm/Projects/wf-playout/wf-playout/`) with the required configuration.

**Important:** After creating or modifying the `.env` file, you must restart the webpack dev server (`npm start`) for changes to take effect.

## Required Variables

### Backend APIs

```bash
# Main backend API for workflow data
REACT_APP_JSRP_BACKEND=http://your-backend-server:port

# State management backend
REACT_APP_JSDB_STATE=http://your-state-server:port

# Galaxy backend
REACT_APP_GXY_BACKEND=http://your-galaxy-server:port

# Proxy backend
REACT_APP_PROXY_BACKEND=http://your-proxy-server:port
```

### Companion Server (for custom variables)

```bash
# Companion server URL for playlist custom variables
# Receives sadna in/out points via HTTP POST
REACT_APP_COMPANION_URL=http://companion-server-ip:port
```

**Default:** `http://localhost:8000`

**API Endpoint:** `POST /api/custom-variable/{varName}/value?value={value}`

### VOD Module Server (for playlist JSON files)

```bash
# VOD module machine URL for generating VOD playlist JSON files
# Files are saved to /usr/local/var/vod-maps/ on the VOD machine
REACT_APP_VOD_URL=http://10.66.1.76
```

**Default:** `http://10.66.1.76`

**API Endpoint:** `POST /api/vod-maps/{playlistName}.json`

**Note:** The VOD server must be running on the target machine. See `VOD-SERVER-README.md` for deployment instructions.

### Other Services

```bash
# Service URL
REACT_APP_SRV_URL=http://your-srv-url

# Live streaming URL
REACT_APP_LIVE_URL=http://your-live-url

# Keycloak authentication URL
REACT_APP_KC_URL=http://your-keycloak-url

# MQTT WebSocket URL for messaging
REACT_APP_MQTT_LCL_URL=ws://your-mqtt-server:port

# MDB (Media Database) Unit URL
REACT_APP_MDB_UNIT_URL=https://kabbalahmedia.info/en/programs/c/
```

## Optional Variables

These variables are for specific network configurations and may not be required for all deployments:

```bash
# Pirati configuration
REACT_APP_PIRATI=

# Test environment
REACT_APP_TEST=

# Merkaz endpoints
REACT_APP_MERKAZ_MAIN=
REACT_APP_MERKAZ_BACKUP=

# VPN endpoints
REACT_APP_VPN_MAIN=
REACT_APP_VPN_BACKUP=

# Decoder endpoints
REACT_APP_DECODER_MAIN=
REACT_APP_DECODER_BACKUP=
REACT_APP_DECODER_TEST=

# STUN server for Galaxy
REACT_APP_STUN_SRV_GXY=
```

## Example `.env` File

```bash
# Backend APIs
REACT_APP_JSRP_BACKEND=http://192.168.1.100:8080
REACT_APP_JSDB_STATE=http://192.168.1.100:8081
REACT_APP_GXY_BACKEND=http://192.168.1.101:8080
REACT_APP_PROXY_BACKEND=http://192.168.1.102:8080

# Companion & VOD
REACT_APP_COMPANION_URL=http://192.168.1.103:8000
REACT_APP_VOD_URL=http://10.66.1.76

# Services
REACT_APP_SRV_URL=http://192.168.1.104
REACT_APP_LIVE_URL=http://192.168.1.105
REACT_APP_KC_URL=http://192.168.1.106:8080
REACT_APP_MQTT_LCL_URL=ws://192.168.1.107:9001
REACT_APP_MDB_UNIT_URL=https://kabbalahmedia.info/en/programs/c/
```

## Features Requiring Specific Variables

### Playlist Generation (Generate Button)
When you click the "Generate Playlists" button, the application:

1. **Sends to Companion Server** (`REACT_APP_COMPANION_URL`)
   - Sends custom variables for sadna in/out points
   - Format: `Ply{N}SadnaIn_{1-10}` and `Ply{N}SadnaOut_{1-10}`
   - Uses: `POST /api/custom-variable/{name}/value?value={value}`

2. **Sends to VOD Module** (`REACT_APP_VOD_URL`)
   - Generates VOD JSON files for each playlist
   - Saves to `/usr/local/var/vod-maps/` on VOD machine
   - Uses: `POST /api/vod-maps/{playlistName}.json`

### Workflow Data Loading
Requires `REACT_APP_JSRP_BACKEND` to fetch source files and workflow data.

## Troubleshooting

### "undefined" in API URLs
**Problem:** Console shows errors like `GET http://localhost:3001/undefined/source/find...`

**Solution:** The required environment variable is not set. Check your `.env` file and restart the dev server.

### Connection Refused Errors
**Problem:** `ERR_CONNECTION_REFUSED` when clicking Generate

**Solution:** 
1. Verify the server is running at the configured address
2. Check network connectivity
3. Verify firewall allows connections
4. Test with `curl http://server-ip:port/health`

### CORS Errors
**Problem:** Browser blocks requests due to CORS policy

**Solution:** The backend servers must allow CORS from the React app origin. The VOD server (`vod-server.js`) already includes CORS headers.

## Security Notes

1. **Development vs Production:** Use different URLs for development and production environments
2. **CORS:** Ensure backend servers have appropriate CORS policies
3. **Authentication:** Some endpoints may require authentication tokens (handled by Keycloak)
4. **Network:** Ensure the React app can reach all configured servers
5. **Firewall:** Configure firewalls to allow necessary connections

## See Also

- `VOD-SERVER-README.md` - VOD server deployment guide
- `README.md` - General project documentation
- `webpack.config.js` - How environment variables are loaded

