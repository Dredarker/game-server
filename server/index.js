const http = require("http");
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");

const PORT = process.env.PORT || 3000;

const adminIp = "5.137.96.67";

const bannedIps = new Set([
  "123.123.123.123"
]);

let HTMLclient = "No client";
fetch('https://raw.githubusercontent.com/Dredarker/game-server/refs/heads/main/client/index.html')
	.then((response) => response.text())
	.then((text) => {HTMLclient = text})
	.catch(error => console.error('Ошибка загрузки клиента:', error));

const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(HTMLclient);
  }
  if (req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("200 OK");
  }
});
const wss = new WebSocket.Server({ server });

console.log(`WebSocket server started on port ${PORT}`);

const clients = new Map();

// game
console.log("Initializating the game");

let gravity = 0.5;

const objects = new Map();
objects.set("bottom", new Obj(-500, 100, 1000, 100, "static", ""));
objects.set("leftbox", new Obj(-600, 0, 100, 200, "static", ""));
objects.set("rightbox", new Obj(500, 0, 100, 200, "static", ""));

function update() {
	objects.forEach((obj, name) => {
		if (obj.mode === "dynamic") {
			obj.vy += gravity;
			obj.vx = obj.vx * 0.7 + (!obj.onGround * 0.25);
			obj.vy *= 0.95;
		}
		
		if (
			obj.mode === "dynamic" ||
			obj.mode === "kinetic"
		) {
			obj.x += obj.vx;
			obj.y += obj.vy;
		}

		objects.forEach((obj2, name) => {
			let obj1 = obj;
			if (obj1 == obj2) return;
			if (obj1.mode == "static") return;

			obj.onGround = false;
			if (checkUnderCollision(obj)) obj.onGround = true;

			objRealX1 = obj1.x+obj1.width/2;
			objRealY1 = obj1.y+obj1.height/2;
			objRealX2 = obj2.x+obj2.width/2;
			objRealY2 = obj2.y+obj2.height/2;
			if (objInRegion(obj1, obj2.x, obj2.y, obj2.width, obj2.height)) {
				if (objInRegion(obj1, obj2.x+5, obj2.y, obj2.width-10, obj2.height/2)) {
					obj1.vy = 0;
					obj1.y = obj2.y - obj1.height;
				} else if (objInRegion(obj1, obj2.x+5, obj2.y+obj2.height/2, obj2.width-10, obj2.height/2)) {
					obj1.vy = 0;
					obj1.y = obj2.y + obj2.height;
				}
				if (objInRegion(obj1, obj2.x, obj2.y+5, obj2.width/2, obj2.height-10)) {
					obj1.vx = 0;
					obj1.x = obj2.x - obj1.width;
				} else if (objInRegion(obj1, obj2.x+obj2.width/2, obj2.y+5, obj2.width/2, obj2.height-10)) {
					obj1.vx = 0;
					obj1.x = obj2.x + obj2.width;
				}
			}
		});
	});
}

function objInRegion(obj, x, y, width, height) {
	return (
		obj.x < x + width &&
		obj.x + obj.width > x &&
		obj.y < y + height &&
		obj.y + obj.height > y
	)
}

function checkUnderCollision(obj) {
	boolean = false;
	objects.forEach((obj2, name) => {
		if (obj !== obj2) {
			if (objInRegion(obj2, obj.x+5, obj.y+obj.height-5, obj.width-10, 10)) boolean = true;
		}
	});
	return boolean;
}

function Obj(x, y, width, height, mode, type) {
	this.x = x;
	this.y = y;
	this.width = width;
	this.height = height;
	this.vx = 0;
	this.vy = 0;
	this.mode = mode;
	this.type = type;
	this.onGround = false;
}

function Player(nickname, speed, jumpPower, obj) {
	for (let i in obj) {
		this[i] = obj[i]
	}
	this.nickname = nickname;
	this.speed = speed;
	this.jumpPower = jumpPower;
}

function server_sync() {
	for (const [id, clientData] of clients.entries()) {
		if (!clientData.joined) return;
  	const client = clientData.ws;
  	if (client.readyState === WebSocket.OPEN) {
  	  client.send(JSON.stringify({
	      type: "sync",
				world: Object.fromEntries(objects)
	    }));
	  }
	}
}

console.log("The game was successful initializated");

setInterval(() => {
	update();
	server_sync();
}, 1000 / 50);

// server
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

  const clientId = uuidv4().slice(0, 16);

  // сохраняем клиента
  clients.set(clientId, {
    ws,
    ip,
		nickname: "",
		joined: false,
  });

  console.log(`Client connected: ${clientId} (${ip})`);

  ws.on("message", (message) => {
    let data;
		let myid;
		for (const [id, clientData] of clients.entries()) {
			if (clientData.ws === ws) {myid = id;break;}
		}

    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

		if (!clients.get(myid).joined) {
			if (data.type === "join") {
      	for (const [id, clientData] of clients.entries()) {
					if (clientData.ws === ws) {
						ws.send(JSON.stringify({
    					type: "init",
    					clientId,
 						}));
						clients.get(id).nickname = data.nickname;
						objects.set(id, new Player(data.nickname, 1, -16, new Obj(0, 0, 50, 50, "dynamic", "player")));
						msg("", clients, `${data.nickname} connected to game`);
						clients.get(id).joined = true;
						break;
					}
      	}
			} else {
				ws.close();
			}
    };

    if (data.type === "sync") {
      for (const [wsId, clientData] of clients.entries()) {
				let client = clientData.ws;
        if (client !== ws) return;
        if (client.readyState === WebSocket.OPEN) {
          objects.forEach((obj, objId) => {
						if (objId !== wsId) return;
		    		if (obj.type !== "player") return;

						let keys = data.keys;
						let tmpspeed = obj.speed * (obj.onGround ? 1 : 0.1);
						if (keys["KeyA"]) obj.vx += -tmpspeed;
	      		else if (keys["KeyD"]) obj.vx += tmpspeed;
	      		if (keys["Space"] && obj.onGround) {
	      			obj.vy = obj.jumpPower;
		      		obj.onGround = false;
		    		}
		  		});
        }
      }
    }

    if (data.type === "msg") msg(clients.get(myid).nickname, clients, data.text);

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

		if (data.type === "console") {
			let result;
			try {result = eval(data.msg)} catch (err) {result = err};
			try {result = JSON.stringify(result)} catch (e) {result = String(result)}
			ws.send(JSON.stringify({
				type: "msg",
				msg: result,
			}))
		};
  });

	ws.on("close", () => {
  	console.log(`Client disconnected: ${clientId}`);
		if (objects.has(clientId)) msg("", clients, `${clients.get(clientId).nickname} disconnected from game`);
    clients.delete(clientId);
		objects.delete(clientId);
  });

  ws.on("error", (err) => {
  	console.error(`Error (${clientId}, ${ip}):`, err);
 	});

	function msg(from, to, text) {
		for (const [id, clientData] of to.entries()) {
  	  const client = clientData.ws;
  	  if (client.readyState === WebSocket.OPEN) {
  	    client.send(JSON.stringify({
	        type: "msg",
	        from,
	        text,
	        ip: (clientData.ip == adminIp ? clients.get(clientId).ip : "none"),
	      }));
	    }
	  }
	}
});

server.listen(PORT, () => {
  console.log("HTTPS server started on port ", PORT);
});
