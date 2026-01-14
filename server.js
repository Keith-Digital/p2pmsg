const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// --- Middlewares & Static Serving ---
app.use(express.static(path.join(__dirname, 'public')));

// Use a writable uploads directory at runtime (outside pkg snapshot).
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
    // Ensure multer writes to the same runtime-writable uploads directory
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`),
});
const upload = multer({ storage });

// --- State ---
const clients = new Map(); // ws -> {id, name}
const chatRooms = new Map(); // roomId -> {id, name, participants: Set}

// --- Helper Functions ---
function getClientWsById(id) {
    for (const [ws, client] of clients.entries()) {
        if (client.id === id) return ws;
    }
    return null;
}

function broadcastUserList() {
    const userList = Array.from(clients.values())
        .filter(user => user.name)
        .map(client => ({ id: client.id, name: client.name }));
    
    const message = JSON.stringify({ type: 'update-users', users: userList });
    clients.forEach((client, ws) => {
        if (client.name && ws.readyState === WebSocket.OPEN) {
            ws.send(message);
        }
    });
}

function broadcastToRoom(roomId, message, excludeId = null) {
    const room = chatRooms.get(roomId);
    if (!room) return;

    const messageStr = JSON.stringify(message);
    room.participants.forEach(participantId => {
        if (participantId === excludeId) return;
        const clientWs = getClientWsById(participantId);
        if (clientWs && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(messageStr);
        }
    });
}

// --- HTTP Endpoints ---
app.post('/upload', upload.single('file'), (req, res) => {
    const { roomId, senderId } = req.body;
    const file = req.file;
    const sender = Array.from(clients.values()).find(c => c.id === senderId);

    if (!file || !roomId || !sender) {
        return res.status(400).send('Bad request.');
    }
    
    // Decode the filename from latin1 to utf8 to handle non-ASCII characters
    const decodedFilename = Buffer.from(file.originalname, 'latin1').toString('utf8');

    const fileMessage = {
        type: 'file-message', roomId, senderId, senderName: sender.name, timestamp: Date.now(),
        file: { name: decodedFilename, url: `/uploads/${file.filename}`, size: file.size }
    };
    broadcastToRoom(roomId, fileMessage);
    res.status(200).send('File uploaded.');
});

// --- WebSocket Logic ---
wss.on('connection', (ws) => {
    const clientId = uuidv4();
    clients.set(ws, { id: clientId, name: null });
    console.log(`Client [${clientId}] connected. Awaiting login.`);

    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            const senderInfo = clients.get(ws);
            if (!senderInfo) return;

            if (parsedMessage.type === 'login') {
                senderInfo.name = parsedMessage.name;
                clients.set(ws, senderInfo);
                console.log(`Client [${senderInfo.id}] logged in as [${senderInfo.name}].`);
                ws.send(JSON.stringify({ type: 'login-success', id: senderInfo.id }));
                broadcastUserList();
                return;
            }

            if (!senderInfo.name) {
                return console.log(`Blocked message from unauthenticated client [${senderInfo.id}].`);
            }

            switch (parsedMessage.type) {
                case 'create-chat-room': {
                    const participantIds = new Set([senderInfo.id, ...parsedMessage.participants]);
                    const roomId = uuidv4();
                    const roomName = Array.from(participantIds)
                        .map(id => Array.from(clients.values()).find(c => c.id === id)?.name || 'Unknown')
                        .join(', ');

                    // Convert Set to Array before storing and sending
                    const newRoom = { id: roomId, name: roomName, participants: Array.from(participantIds) };
                    // Store the Set on the server for efficient lookups
                    chatRooms.set(roomId, { ...newRoom, participants: participantIds });

                    const roomCreatedMessage = { type: 'room-created', room: newRoom };
                    broadcastToRoom(roomId, roomCreatedMessage);
                    break;
                }
                case 'chat-message': {
                    const { roomId, content } = parsedMessage;
                    const room = chatRooms.get(roomId);
                    if (room && room.participants.has(senderInfo.id)) {
                        const chatMessage = {
                            type: 'chat-message', roomId, content,
                            senderId: senderInfo.id, senderName: senderInfo.name, timestamp: Date.now()
                        };
                        broadcastToRoom(roomId, chatMessage);
                    }
                    break;
                }
                case 'start-typing':
                case 'stop-typing': {
                    const { roomId } = parsedMessage;
                    broadcastToRoom(roomId, {
                        type: 'user-typing', roomId, userName: senderInfo.name,
                        isTyping: parsedMessage.type === 'start-typing'
                    }, senderInfo.id);
                    break;
                }
                case 'invite-users': {
                    const { roomId, usersToInvite } = parsedMessage;
                    const room = chatRooms.get(roomId);
                    if (room && room.participants.has(senderInfo.id)) {
                        const newUsers = usersToInvite.map(id => Array.from(clients.values()).find(c => c.id === id)).filter(Boolean);
                        newUsers.forEach(user => room.participants.add(user.id));
                        room.name = Array.from(room.participants).map(id => Array.from(clients.values()).find(c => c.id === id)?.name || 'Unknown').join(', ');
                        
                        // Create a version of the room with participants as an array for broadcasting
                        const roomForBroadcast = { ...room, participants: Array.from(room.participants) };

                        broadcastToRoom(roomId, { type: 'system-message', roomId, content: `${newUsers.map(u=>u.name).join(', ')} 님이 채팅에 참여했습니다.` });
                        
                        newUsers.forEach(user => {
                            const clientWs = getClientWsById(user.id);
                            if(clientWs) clientWs.send(JSON.stringify({ type: 'room-created', room: roomForBroadcast }));
                        });
                    }
                    break;
                }
                case 'leave-room': {
                    const { roomId } = parsedMessage;
                    const room = chatRooms.get(roomId);
                    if (room && room.participants.has(senderInfo.id)) {
                        room.participants.delete(senderInfo.id);
                        
                        if (room.participants.size <= 1) {
                            // Dissolve the room if it's empty or has only one person left
                            chatRooms.delete(roomId);
                            // Optionally notify the last person
                            const lastPersonId = room.participants.values().next().value;
                            if(lastPersonId) {
                                broadcastToRoom(roomId, { type: 'system-message', roomId, content: '다른 참여자가 모두 나가 채팅방이 종료되었습니다.' });
                            }
                        } else {
                            // Announce that the user has left
                            broadcastToRoom(roomId, { type: 'system-message', roomId, content: `${senderInfo.name} 님이 채팅을 나갔습니다.` });
                        }
                    }
                    break;
                }
            }
        } catch (error) {
            console.error('Failed to handle message:', error);
        }
    });

    ws.on('close', () => {
        const closedClientInfo = clients.get(ws);
        if (closedClientInfo) {
            clients.delete(ws);
            if (closedClientInfo.name) {
                console.log(`Client [${closedClientInfo.name}] disconnected.`);
                broadcastUserList();
                chatRooms.forEach((room, roomId) => {
                    if (room.participants.has(closedClientInfo.id)) {
                        room.participants.delete(closedClientInfo.id);
                        if (room.participants.size <= 1) {
                            chatRooms.delete(roomId);
                        } else {
                            broadcastToRoom(roomId, { type: 'system-message', roomId, content: `${closedClientInfo.name} 님이 채팅을 나갔습니다.` });
                        }
                    }
                });
            }
        }
    });
});

// --- Server Start ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`서버가 ${PORT}번 포트에서 실행 중입니다.`);
    console.log(`웹 브라우저에서 http://localhost:${PORT} 로 접속하세요.`);
});