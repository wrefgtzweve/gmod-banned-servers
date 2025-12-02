import express from 'express';
import fetch from 'node-fetch';
import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, '.bans-cache.db');
const HTML_CACHE_FILE = path.join(__dirname, '.html-cache.json');
const API_KEY = 'RWsOQQrO860EaGY3qPsSsBQSev3gNO0KrcF3kv4Rl5frjE9OuUKQgAsRutxMZ4aU';
const FACEPUNCH_API = `https://api.facepunch.com/api/public/manifest?public_key=${API_KEY}`;
const HTML_TEMPLATE = fs.readFileSync(path.join(__dirname, 'banned.html'), 'utf-8');

let cachedHtml = null;
let cachedBanHash = null;

// Initialize database
function initDatabase() {
    const db = new Database(DB_FILE);
    
    // Create table if it doesn't exist
    db.exec(`
        CREATE TABLE IF NOT EXISTS bans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry TEXT UNIQUE NOT NULL,
            timestamp INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    return db;
}

const db = initDatabase();

// Get all cached entries
function getCachedEntries() {
    const stmt = db.prepare('SELECT entry, timestamp FROM bans');
    const rows = stmt.all();
    const entries = {};
    rows.forEach(row => {
        entries[row.entry] = row.timestamp;
    });
    return entries;
}

// Check if this is the first cache (no entries)
function isFirstCache() {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM bans');
    const result = stmt.get();
    return result.count === 0;
}

// Add or update an entry in cache
function upsertEntry(entry, timestamp) {
    const stmt = db.prepare(`
        INSERT INTO bans (entry, timestamp) 
        VALUES (?, ?) 
        ON CONFLICT(entry) DO UPDATE SET timestamp = excluded.timestamp
    `);
    stmt.run(entry, timestamp);
}

// Identify new entries by comparing with cache
function identifyNewEntries(currentBanned, oldCache, isFirst = false) {
    const newEntries = {};
    const now = Date.now();
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    // Skip new entry detection on first cache
    if (isFirst) {
        return newEntries;
    }
    
    currentBanned.forEach(item => {
        if (!oldCache[item]) {
            // New entry not in cache
            newEntries[item] = now;
        } else if (oldCache[item] > oneWeekAgo) {
            // Existing entry that was added within last week
            newEntries[item] = oldCache[item];
        }
    });
    
    return newEntries;
}

// Generate a simple hash of ban data for cache comparison
function generateBanHash(banData) {
    return crypto.createHash('md5').update(JSON.stringify(banData)).digest('hex');
}

// Load HTML cache from file
function loadHtmlCache() {
    try {
        if (fs.existsSync(HTML_CACHE_FILE)) {
            const cache = JSON.parse(fs.readFileSync(HTML_CACHE_FILE, 'utf-8'));
            return cache;
        }
    } catch (error) {
        console.error('Error loading HTML cache:', error);
    }
    return null;
}

// Save HTML cache to file
function saveHtmlCache(html, banHash) {
    try {
        fs.writeFileSync(HTML_CACHE_FILE, JSON.stringify({ html, banHash }, null, 2));
    } catch (error) {
        console.error('Error saving HTML cache:', error);
    }
}

// Fetch and cache bans
async function fetchAndCacheBans() {
    try {
        const response = await fetch(FACEPUNCH_API);
        const data = await response.json();
        const currentBanned = data.Servers?.Banned || [];
        
        // Load old cache
        const oldCache = getCachedEntries();
        
        // Check if this is the first cache
        const isFirst = isFirstCache();
        
        // Update database with current entries FIRST
        const now = Date.now();
        const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
        
        currentBanned.forEach(item => {
            if (!oldCache[item]) {
                // For first cache, set all entries to old timestamp so they don't show as new
                const timestamp = isFirst ? oneWeekAgo - 1000 : now;
                upsertEntry(item, timestamp);
            }
        });
        
        // Now identify new entries AFTER database is updated
        const newEntries = identifyNewEntries(currentBanned, oldCache, isFirst);
        
        return {
            banned: currentBanned,
            new: Object.keys(newEntries),
            cacheTimestamp: Object.keys(oldCache).length > 0 ? Math.min(...Object.values(oldCache)) : 0,
            fetchTimestamp: now
        };
    } catch (error) {
        console.error('Error fetching bans:', error);
        return {
            banned: [],
            new: [],
            cacheTimestamp: 0,
            fetchTimestamp: Date.now(),
            error: error.message
        };
    }
}

app.use(express.static(__dirname, { index: false }));

app.get('/', async (req, res) => {
    try {
        const banData = await fetchAndCacheBans();
        const banHash = generateBanHash(banData);
        
        // Check if we have a cached HTML with the same ban data hash
        const htmlCache = loadHtmlCache();
        if (htmlCache && htmlCache.banHash === banHash) {
            res.set('Content-Type', 'text/html; charset=utf-8');
            res.set('X-Cache', 'HIT');
            return res.send(htmlCache.html);
        }
        
        // Generate new HTML
        const html = HTML_TEMPLATE.replace(
            '<!-- DATA_INJECTION_POINT -->',
            `<script>
                window.__BAN_DATA__ = ${JSON.stringify(banData)};
            </script>`
        );
        
        // Save to cache
        saveHtmlCache(html, banHash);
        
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('X-Cache', 'MISS');
        res.send(html);
    } catch (error) {
        res.status(500).send('Error fetching ban data');
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
