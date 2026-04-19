const http = require("http");
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");

const PORT = process.env.PORT || 3000;

const adminIp = "5.137.96.67";

const bannedIps = new Set([
  "123.123.123.123"
]);

const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("Server is running");
  }
});
const wss = new WebSocket.Server({ server });

console.log(`WebSocket server started on port ${PORT}`);

const clients = new Map();

wss.on("connection", (ws, req) => {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket.remoteAddress;

  if (bannedIps.has(ip)) {
    console.log(`Blocked connection from banned IP: ${ip}`);

    ws.send(JSON.stringify({
      type: "error",
      message: "ip-ban"
    }));

    ws.close();

    return;
  }

  const clientId = uuidv4().slice(0, 7);

  // сохраняем клиента
  clients.set(clientId, {
    ws,
    ip
  });

  console.log(`Client connected: ${clientId} (${ip})`);

  for (const [id, clientData] of clients.entries()) {
    const client = clientData.ws;
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: "connect",
        text: clientId,
        ip: (clientData.ip == adminIp ? ip : "none")
      }));
    }
  }
  // отправляем клиенту его данные
  ws.send(JSON.stringify({
    type: "init",
    clientId,
    ip
  }));

  ws.on("message", (message) => {
    let data;

    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    // === типы сообщений ===

    // 1. Сообщение всем
    if (data.type === "broadcast") {
      for (const [id, clientData] of clients.entries()) {
        const client = clientData.ws;
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: "message",
            from: clientId,
            text: data.text,
            ip: (clientData.ip == adminIp ? ip : "none")
          }));
        }
      }
    }

    // 2. Личное сообщение
    if (data.type === "private") {
      const target = clients.get(data.to);

      if (target && target.ws.readyState === WebSocket.OPEN) {
        target.ws.send(JSON.stringify({
          type: "message",
          from: clientId,
          text: data.text,
          ip: (clientData.ip == adminIp ? ip : "none")
        }));
      }
    }

    // 3. Гет
    if (data.type === "getclients") {
      if (ws.readyState === WebSocket.OPEN) {
        let clientsIds = [];
        for (let i of clients.keys()) {
          clientsIds.push(i);
        }
        ws.send(JSON.stringify({
          type: "getclients",
          text: clientsIds
        }));
      }
    }
  });

  ws.on("close", () => {
    console.log(`Client disconnected: ${clientId}`);
    clients.delete(clientId);
    for (const [id, clientData] of clients.entries()) {
      const client = clientData.ws;
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: "disconnect",
          text: clientId,
          ip: (clientData.ip == adminIp ? ip : "none")
        }));
      }
    }
  });

  ws.on("error", (err) => {
    console.error(`Error (${clientId}, ${ip}):`, err);
  });
});

server.listen(PORT, () => {
  console.log("Server running on port ", PORT);
});
