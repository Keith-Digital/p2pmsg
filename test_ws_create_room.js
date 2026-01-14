const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3000');

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'login', name: 'tester' }));
});

ws.on('message', (msg) => {
  try {
    const data = JSON.parse(msg.toString());
    if (data.type === 'login-success') {
      console.log('SENDER_ID:' + data.id);
      ws.send(JSON.stringify({ type: 'create-chat-room', participants: [] }));
    }
    if (data.type === 'room-created') {
      console.log('ROOM_ID:' + data.room.id);
      process.exit(0);
    }
  } catch (e) {
    // ignore
  }
});

ws.on('error', (err) => { console.error('WS_ERR', err); process.exit(2); });
