# Local Keep

A simple Google Keep-like notes app built with Vue 3. Persistent storage with password protection and real-time sync.

## Features

- 📝 Create, edit, and delete notes
- 🔒 Password protection with first-time setup
- 💾 Server-side persistence (data survives server restarts)
- 🔄 **Real-time sync via WebSocket** (instant updates across devices)
- 🌐 Accessible remotely (exposed on 0.0.0.0)
- 🎨 Clean, minimal interface similar to Google Keep
- ⌨️ Ctrl+Enter to quickly add/save notes
- 🔌 Auto-reconnect on connection loss

## Quick Start

One command to build and start:
```bash
npm start
```

Access at `http://localhost:5173` or `http://your-ip:5173`

## How Real-Time Sync Works

- **WebSocket-based** - Instant bidirectional communication
- **Live updates** - Changes appear immediately on all connected devices
- **Auto-reconnect** - Automatically reconnects if connection drops
- **Smart conflict handling** - Pauses updates while you're editing

### Data Storage
All data is stored in the `data/` directory:
- `data/password.json` - Password hash
- `data/notes.json` - Your notes

Notes persist after server restarts. Back up the `data/` directory to preserve your notes.

## Development

Run with hot reload (Vite dev server + API):
```bash
npm run dev
```

## Security Note

The password is stored as a simple hash. This is fine for personal use, but not suitable for sensitive data. Consider using a reverse proxy (nginx) with HTTPS for remote access.

## Tech Stack

- Vue 3 (Composition API)
- Vite
- Express.js
- WebSocket (ws) for real-time sync
- File-based JSON storage
