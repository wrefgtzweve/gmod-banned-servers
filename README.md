# Vibecode - Facepunch Banned List Tracker

A real-time dashboard displaying banned items from Facepunch's public API, with caching and change tracking.

## Features

- **Live Ban List** - Displays all banned maps, gamemodes, IPs, hosts, and descriptions
- **Change Tracking** - Shows items banned in the last 7 days
- **Search & Filter** - Real-time search across all categories
- **SQLite Caching** - Efficient caching with SQLite database
- **HTML Caching** - Pre-rendered HTML cache for faster responses
- **Dark Theme** - Modern dark UI with responsive design
- **Server-Side Rendering** - Data injected at render time for instant page load

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start the server
npm start

# Or use nodemon for development
npx nodemon server.js
```

Visit `http://localhost:3000` in your browser.

### Docker

**Build and run with Docker:**

```bash
docker build -t vibecode .
docker run -p 3000:3000 vibecode
```

**Using Docker Compose:**

```bash
docker-compose up --build
```

The application will be available at `http://localhost:3000`.

## Project Structure

```
.
├── server.js           # Express server with SSR and caching
├── banned.html         # Frontend HTML/CSS/JS
├── .bans-cache.db      # SQLite database (auto-created)
├── .html-cache.json    # HTML cache (auto-created)
├── Dockerfile          # Docker configuration
├── docker-compose.yml  # Docker Compose configuration
├── .gitignore          # Git ignore rules
└── .dockerignore       # Docker ignore rules
```

## How It Works

1. **Server-Side Rendering** - On each request, the server fetches the latest ban data from Facepunch API
2. **Database Caching** - Ban entries are stored in SQLite with timestamps to track when they were first seen
3. **Change Detection** - Items added within the last 7 days are marked as "new"
4. **HTML Caching** - Generated HTML is cached and only regenerated when ban data changes
5. **Client-Side Search** - Live filtering happens instantly in the browser

## API Integration

Fetches from Facepunch's public manifest API:
- Endpoint: `https://api.facepunch.com/api/public/manifest`
- Updates on each page request
- No authentication required (uses public key)

## Technologies

- **Backend**: Node.js, Express
- **Database**: SQLite (better-sqlite3)
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Containerization**: Docker, Docker Compose

## Environment Variables

Create a `.env` file if needed:

```
NODE_ENV=production
PORT=3000
```

## License

MIT
