const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');

// ... (setup is the same)
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`),
});
const upload = multer({ storage });

const clients = new Map();
const chatRooms = new Map();

// --- Helper Functions (broadcastToRoom, getClientById, etc. are the same) ---
function broadcastUserList() {
    const userList = Array.from(clients.values()).map(client => ({
        id: client.id,
        name: client.name 
    })).filter(user => user.name); // Send only logged-in users
    
    const message = JSON.stringify({ type: 'update-users', users: userList });
    clients.forEach((client, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
        }
    });
}


// --- WebSocket Logic ---
wss.on('connection', (ws) => {
    const clientId = uuidv4();
    // Store client initially without a name
    clients.set(ws, { id: clientId, name: null });
    console.log(`클라이언트 [${clientId}] 연결됨. 로그인 대기 중...`);

    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            const senderInfo = clients.get(ws);
            if (!senderInfo) return;

            // Allow 'login' message even if not fully logged in
            if (parsedMessage.type === 'login') {
                senderInfo.name = parsedMessage.name;
                clients.set(ws, senderInfo);
                console.log(`클라이언트 [${senderInfo.id}]가 [${senderInfo.name}] (으)로 로그인했습니다.`);
                
                // Send login success and current user ID
                ws.send(JSON.stringify({ type: 'login-success', id: senderInfo.id }));
                
                // Announce the new user to everyone
                broadcastUserList();
                return;
            }

            // For all other messages, require the user to be logged in
            if (!senderInfo.name) {
                console.log(`[${senderInfo.id}]로부터 로그인되지 않은 메시지 차단:`, parsedMessage.type);
                return;
            }
            
            // Handle other message types
            switch (parsedMessage.type) {
                // ... (cases for create-chat-room, chat-message, etc. remain the same)
            }

        } catch (error) {
            console.error('메시지 처리 실패:', error);
        }
    });

    ws.on('close', () => {
        const closedClientInfo = clients.get(ws);
        if (closedClientInfo) {
            console.log(`클라이언트 [${closedClientInfo.name || closedClientInfo.id}] 연결 끊어짐.`);
            clients.delete(ws);
            // Announce departure only if they were logged in
            if (closedClientInfo.name) {
                broadcastUserList();
                // ... (rest of room cleanup logic is the same)
            }
        }
    });
});

// ... (HTTP endpoints and server start are the same)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`서버가 ${PORT}번 포트에서 실행 중입니다.`);
});