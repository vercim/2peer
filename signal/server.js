const WebSocket = require('ws');

const port = process.env.PORT || 3030;
const wss = new WebSocket.Server({ port });
const clients = new Map();

function send(ws, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

wss.on('connection', (ws) => {
  let currentId = null;

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch (_) {
      send(ws, { type: 'error', message: 'Invalid JSON payload.' });
      return;
    }

    if (message.type === 'register') {
      currentId = String(message.id || '').trim();
      if (!currentId) {
        send(ws, { type: 'error', message: 'ID is required.' });
        return;
      }
      if (clients.has(currentId) && clients.get(currentId) !== ws) {
        send(ws, { type: 'error', message: 'Такой ID уже используется в сети.' });
        return;
      }
      clients.set(currentId, ws);
      send(ws, { type: 'registered', id: currentId });
      return;
    }

    const targetId = String(message.to || '').trim();
    const target = clients.get(targetId);
    if (!target) {
      send(ws, { type: 'error', message: `Пользователь ${targetId || 'unknown'} не найден.` });
      return;
    }

    send(target, {
      ...message,
      from: message.from || currentId
    });
  });

  ws.on('close', () => {
    if (currentId && clients.get(currentId) === ws) {
      clients.delete(currentId);
    }
  });
});

console.log(`Signaling server started on ws://localhost:${port}`);
