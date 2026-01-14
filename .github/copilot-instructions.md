# Copilot / AI Agent Instructions for p2pmsg

Purpose
- Help AI coding agents become immediately productive in this repository (quick context, patterns, run/debug steps).

Big picture
- Single-process Node.js app: `server.js` runs an Express HTTP server and a `ws` WebSocket server on the same port.
- Static client is served from `public/` (UI in `public/app.js`, markup in `public/index.html`).
- File uploads are handled via `multer` and stored in `uploads/` and exposed at `/uploads`.

Core runtime & data flows
- Clients connect over WebSocket to `server.js`; server assigns a UUID (`uuidv4`) per connection and stores `clients` as a Map keyed by `ws` -> `{id, name}`.
- Chat rooms are stored in `chatRooms` (server-side value stores `participants` as a `Set` for efficient membership checks). When broadcasting/sending to clients the room object uses `participants` as an array.
- File upload flow: client POSTs to `/upload` with multipart `file`, `roomId`, `senderId`. Server decodes `originalname` from latin1->utf8 and broadcasts a `file-message` to the room.

Message protocol (examples)
- `login`: { type: 'login', name: string } -> server replies `login-success`: { type: 'login-success', id }
- `chat-message`: { type: 'chat-message', roomId, content } -> broadcast `{ type: 'chat-message', roomId, content, senderId, senderName, timestamp }`
- `file-message` (from server): { type: 'file-message', roomId, senderId, senderName, timestamp, file: { name, url, size } }
- Other message types used: `update-users`, `room-created`, `room-updated`, `system-message`, `start-typing`, `stop-typing`, `user-typing`.

Key implementation patterns and gotchas
- Server uses `Map` keyed by WebSocket object (`clients`) — when looking up by client id, use helper `getClientWsById(id)`.
- `chatRooms` stores `participants` as a `Set` server-side; code often converts to `Array.from(room.participants)` before sending to clients.
- When dissolving rooms the server removes the room when `participants.size <= 1` — watch room lifecycle when changing invite/leave logic.
- Filenames: server decodes uploaded `file.originalname` from latin1 to utf8 to preserve non-ASCII names; preserve this behavior when altering upload logic.
- The code uses CommonJS (`type: 'commonjs'` in `package.json`) — use `require`/`module.exports` when adding new files.

Developer workflows
- Install dependencies: `npm install`.
- Run locally: `node server.js` (server listens on `process.env.PORT || 3000`).
- Open browser to `http://localhost:3000` (or bind address shown in `README.md` for LAN use).
- No test suite present; changes should be validated manually by opening multiple browser windows to simulate users and watching both server console logs and browser console.

Debugging tips
- Server logs: `server.js` prints lifecycle events (connections, login, disconnects) — start here for WebSocket issues.
- Browser console: `public/app.js` logs incoming server messages (`console.log('서버 메시지:', data)`), useful for protocol mismatches.
- To debug user lookup issues, inspect `clients` Map and `chatRooms` entries in server runtime (add temporary logging around `getClientWsById` and room updates).

Files to inspect first
- `server.js` — authoritative place for business logic, message handling, uploads, and room lifecycle.
- `public/app.js` — client-side WebSocket logic and UI behavior; mirrors server message types and expectations.
- `public/index.html` — UI entrypoint and DOM structure for selectors used by `app.js`.
- `package.json` — dependencies (express, ws, multer, uuid) and runtime mode.

If you change message shapes
- Update both `server.js` and `public/app.js` simultaneously. Tests are manual only — coordinate changes so both sides remain in sync.

What I did and next steps
- This file summarizes discovered patterns and concrete examples. Ask for missing details (e.g., preferred dev scripts, CI hooks) and I will iterate.
