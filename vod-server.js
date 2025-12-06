#!/usr/bin/env node

/**
 * VOD Module HTTP Server
 * 
 * This server runs on the VOD machine (default: 10.66.1.76)
 * It receives playlist JSON files and saves them to /usr/local/var/vod-maps/
 * 
 * Installation on VOD machine:
 * 1. Install Node.js if not already installed
 * 2. Copy this file to the VOD machine
 * 3. Run: npm install express
 * 4. Run as service: node vod-server.js
 * 
 * Or use PM2 for production:
 * npm install -g pm2
 * pm2 start vod-server.js --name vod-api
 * pm2 save
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 80;
const VOD_MAPS_DIR = process.env.VOD_MAPS_DIR || '/usr/local/var/vod-maps';

// Middleware
app.use(express.json({ limit: '10mb' }));

// CORS headers for cross-origin requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Ensure VOD maps directory exists
if (!fs.existsSync(VOD_MAPS_DIR)) {
  try {
    fs.mkdirSync(VOD_MAPS_DIR, { recursive: true });
    console.log(`Created VOD maps directory: ${VOD_MAPS_DIR}`);
  } catch (error) {
    console.error(`Failed to create VOD maps directory: ${error.message}`);
    process.exit(1);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'VOD Module API',
    vodMapsDir: VOD_MAPS_DIR,
    timestamp: new Date().toISOString()
  });
});

// List all VOD maps
app.get('/api/vod-maps', (req, res) => {
  try {
    const files = fs.readdirSync(VOD_MAPS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(VOD_MAPS_DIR, f),
        size: fs.statSync(path.join(VOD_MAPS_DIR, f)).size,
        modified: fs.statSync(path.join(VOD_MAPS_DIR, f)).mtime
      }));
    
    res.json({ success: true, files });
  } catch (error) {
    console.error('Error listing VOD maps:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get specific VOD map
app.get('/api/vod-maps/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    if (!filename.endsWith('.json')) {
      return res.status(400).json({ success: false, error: 'Filename must end with .json' });
    }
    
    const filepath = path.join(VOD_MAPS_DIR, filename);
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    
    const content = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    res.json({ success: true, file: filename, content });
  } catch (error) {
    console.error('Error reading VOD map:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create or update VOD map
app.post('/api/vod-maps/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    
    // Validate filename
    if (!filename.endsWith('.json')) {
      return res.status(400).json({ success: false, error: 'Filename must end with .json' });
    }
    
    // Validate JSON payload
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid JSON payload' });
    }
    
    // Validate required fields
    if (!req.body.sequences || !Array.isArray(req.body.sequences)) {
      return res.status(400).json({ success: false, error: 'Missing or invalid sequences field' });
    }
    
    const filepath = path.join(VOD_MAPS_DIR, filename);
    
    // Write JSON file with pretty formatting
    fs.writeFileSync(filepath, JSON.stringify(req.body, null, 2), 'utf8');
    
    console.log(`✓ Saved VOD map: ${filename}`);
    
    res.json({ 
      success: true, 
      file: filename,
      path: filepath,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error saving VOD map:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete VOD map
app.delete('/api/vod-maps/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    if (!filename.endsWith('.json')) {
      return res.status(400).json({ success: false, error: 'Filename must end with .json' });
    }
    
    const filepath = path.join(VOD_MAPS_DIR, filename);
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    
    fs.unlinkSync(filepath);
    console.log(`✓ Deleted VOD map: ${filename}`);
    
    res.json({ success: true, file: filename, deleted: true });
  } catch (error) {
    console.error('Error deleting VOD map:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete ALL VOD maps (clear folder)
app.delete('/api/vod-maps', (req, res) => {
  try {
    const files = fs.readdirSync(VOD_MAPS_DIR)
      .filter(f => f.endsWith('.json'));
    
    let deletedCount = 0;
    const errors = [];
    
    files.forEach(file => {
      try {
        const filepath = path.join(VOD_MAPS_DIR, file);
        fs.unlinkSync(filepath);
        deletedCount++;
        console.log(`✓ Deleted: ${file}`);
      } catch (err) {
        errors.push({ file, error: err.message });
        console.error(`✗ Failed to delete ${file}:`, err.message);
      }
    });
    
    console.log(`Cleared VOD maps folder: ${deletedCount} files deleted`);
    
    res.json({ 
      success: true, 
      deletedCount,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error clearing VOD maps:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('='.repeat(50));
  console.log('  VOD Module HTTP Server');
  console.log('='.repeat(50));
  console.log(`  Port: ${PORT}`);
  console.log(`  VOD Maps Directory: ${VOD_MAPS_DIR}`);
  console.log(`  Health Check: http://localhost:${PORT}/health`);
  console.log('='.repeat(50));
  console.log('');
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

