import express from 'express';
import fetch from 'node-fetch';
import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const CACHE_DIR = path.join(__dirname, 'cache');
const DB_FILE = path.join(CACHE_DIR, 'bans-cache.db');
const API_KEY = 'RWsOQQrO860EaGY3qPsSsBQSev3gNO0KrcF3kv4Rl5frjE9OuUKQgAsRutxMZ4aU';
const FACEPUNCH_API = `https://api.facepunch.com/api/public/manifest?public_key=${API_KEY}`;
const HTML_TEMPLATE = fs.readFileSync(path.join(__dirname, 'banned.html'), 'utf-8');
const REFRESH_INTERVAL = 60 * 60 * 1000;
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

let cachedBanData = null;
let lastFetchTime = 0;

// Initialize database
function initDatabase() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    const db = new Database(DB_FILE);
    db.exec(`
        CREATE TABLE IF NOT EXISTS bans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry TEXT UNIQUE NOT NULL,
            timestamp INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            removed_at INTEGER
        )
    `);
    const columns = db.prepare('PRAGMA table_info(bans)').all().map(col => col.name);
    if (!columns.includes('removed_at')) {
        db.exec('ALTER TABLE bans ADD COLUMN removed_at INTEGER');
    }
    return db;
}

const db = initDatabase();

// Get all currently active (not removed) cached entries
function getActiveEntries() {
    const stmt = db.prepare('SELECT entry, timestamp FROM bans WHERE removed_at IS NULL');
    const rows = stmt.all();
    const entries = {};
    rows.forEach(row => {
        entries[row.entry] = row.timestamp;
    });
    return entries;
}

// Check if this is the first cache
function isFirstCache() {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM bans');
    const result = stmt.get();
    return result.count === 0;
}

// Identify new entries by comparing with cache
function identifyNewEntries(currentBanned, oldCache, isFirst = false) {
    const newEntries = {};
    const now = Date.now();
    const oneMonthAgo = now - ONE_MONTH_MS;

    if (isFirst) {
        return newEntries;
    }

    currentBanned.forEach(item => {
        if (!oldCache[item]) {
            newEntries[item] = now;
        } else if (oldCache[item] > oneMonthAgo) {
            newEntries[item] = oldCache[item];
        }
    });
    
    return newEntries;
}

// Background fetch function
async function backgroundFetch() {
    try {
        const response = await fetch(FACEPUNCH_API);
        const data = await response.json();
        const currentBanned = data.Servers?.Banned || [];
        
        const oldCache = getActiveEntries();
        const isFirst = isFirstCache();
        const now = Date.now();
        const oneMonthAgo = now - ONE_MONTH_MS;
        const currentSet = new Set(currentBanned);

        const newEntries = identifyNewEntries(currentBanned, oldCache, isFirst);

        // Apply inserts, removals, and purges using a transaction for better performance
        if (currentBanned.length > 0) {
            const insert = db.prepare('INSERT INTO bans (entry, timestamp) VALUES (?, ?) ON CONFLICT(entry) DO UPDATE SET timestamp = excluded.timestamp, removed_at = NULL');
            const markRemoved = db.prepare('UPDATE bans SET removed_at = ? WHERE entry = ?');
            const purgeRemoved = db.prepare('DELETE FROM bans WHERE removed_at IS NOT NULL AND removed_at <= ?');
            const applyUpdates = db.transaction(() => {
                currentBanned.forEach(item => {
                    if (!oldCache[item]) {
                        const timestamp = isFirst ? oneMonthAgo - 1000 : now;
                        insert.run(item, timestamp);
                    }
                });
                Object.keys(oldCache).forEach(entry => {
                    if (!currentSet.has(entry)) {
                        markRemoved.run(now, entry);
                    }
                });
                purgeRemoved.run(oneMonthAgo);
            });
            applyUpdates();
        }

        const removedEntries = db.prepare('SELECT entry, removed_at FROM bans WHERE removed_at IS NOT NULL AND removed_at > ?')
            .all(oneMonthAgo)
            .map(row => ({ entry: row.entry, timestamp: row.removed_at }));

        const banData = {
            banned: currentBanned,
            new: Object.entries(newEntries).map(([entry, timestamp]) => ({ entry, timestamp })),
            removed: removedEntries,
            cacheTimestamp: Object.keys(oldCache).length > 0 ? Math.min(...Object.values(oldCache)) : 0,
            fetchTimestamp: now
        };

        lastFetchTime = now;

        if (JSON.stringify(cachedBanData) !== JSON.stringify(banData)) {
            cachedBanData = banData;
            console.log(`[${new Date().toISOString()}] Ban data updated, ${currentBanned.length} bans, ${Object.keys(newEntries).length} new, ${removedEntries.length} removed`);
        }
    } catch (error) {
        console.error('Error in background fetch:', error);
    }
}

// Start background refresh on server startup
async function startBackgroundRefresh() {
    console.log('Starting background ban data refresh...');
    await backgroundFetch();
    setInterval(backgroundFetch, REFRESH_INTERVAL);
}

app.get('/', (req, res) => {
    if (!cachedBanData) {
        res.status(503).send('Ban data not yet loaded, please try again in a moment');
        return;
    }
    
    const html = HTML_TEMPLATE.replace(
        '<!-- DATA_INJECTION_POINT -->',
        `<script>
            window.__BAN_DATA__ = ${JSON.stringify(cachedBanData)};
        </script>`
    );
    
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('X-Last-Update', new Date(lastFetchTime).toISOString());
    res.send(html);
});

app.listen(PORT, async () => {
    console.log(`Server running at http://localhost:${PORT}`);
    await startBackgroundRefresh();
});
