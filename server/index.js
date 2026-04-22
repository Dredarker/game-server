const http = require("http");
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");

const PORT = process.env.PORT || 3000;

const adminIp = "5.137.96.67";

const bannedIps = new Set([
  "123.123.123.123"
]);

let HTMLclient = "No client";
/*
fetch('https://github.com/Dredarker/game-server/raw/refs/heads/main/client/index.html')
  .then((response) => {HTMLclient = response.text()})
  .catch(error => console.error('Ошибка загрузки клиента:', error));
*/

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

const gravity = 0.5;

const objects = new Map();
objects.set("bottom", new Obj(-5000, 100, 10000, 100, "", "static"));
objects.set("platform", new Obj(-500, 0, 100, 100, "", "static"));

function update() {
	objects.forEach((obj, name) => {
		if (obj.mode === "dynamic") obj.vy += gravity;
		
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
			if (obj.mode == "static") return;
			/*
			objRealX1 = obj1.x+obj1.width/2;
			objRealY1 = obj1.y+obj1.height/2;
			objRealX2 = obj2.x+obj2.width/2;
			objRealY2 = obj2.y+obj2.height/2;
			*/
			if (obj.type === "player") obj.onGround = false;
			if (objInRegion(obj1, obj2.x, obj2.y, obj2.width, obj2.height)) {
				if (objInRegion(obj1, obj2.x+5, obj2.y, obj2.width-10, obj2.height/2)) {
					obj1.vy = obj2.vy;
					obj1.vy = 0;
					obj1.y = obj2.y - obj1.height;
					obj1.onGround = true;
				} else if (objInRegion(obj1, obj2.x+5, obj2.y+obj2.height/2, obj2.width-10, obj2.height/2)) {
					obj1.vy = obj2.vy;
					obj1.vy = 0;
					obj1.y = obj2.y + obj2.height + obj1.height;
				}
				if (objInRegion(obj1, obj2.x, obj2.y+5, obj2.width/2, obj2.height-10)) {
					obj1.vx = obj2.vx;
					obj1.vx = 0;
					obj1.x = obj2.x - obj1.width;
				} else if (objInRegion(obj1, obj2.x+obj2.width/2, obj2.y+5, obj2.width/2, obj2.height-10)) {
					obj1.vx = obj2.vx;
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

function Obj(x, y, width, height, mode, type) {
	this.x = x;
	this.y = y;
	this.width = width;
	this.height = height;
	this.vx = 0;
	this.vy = 0;
	this.mode = mode;
	this.type = type;
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
		if (clientData.joined) return;
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
}, 50);

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
  ws.send(JSON.stringify({
    type: "init",
    clientId,
  }));

  ws.on("message", (message) => {
    let data;
		let mywsdata;
		for (const [id, clientData] of clients.entries()) {
			if (clientData.ws === ws) {mywsdata = clientData;break;}
		}

    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

		if (!mywsdata.joined) {
			if (data.type === "join") {
      	for (const [id, clientData] of clients.entries()) {
					if (clientData.ws === ws) {
						clients.get(id).nickname = data.nickname;
						objects.set(clientId, new Player(data.nickname, 1.1, -11, new Obj(0, 0, 50, 50, "player", "dynamic")));
						msg("", clients, `${data.nickname} connected to game`);
						mywsdata.joined = true;
						break;
					}
      	}
			}
    } else ws.close();

    if (data.type === "sync") {
      for (const [wsId, clientData] of clients.entries()) {
				let client = clientData.ws;
        if (client !== ws) return;
        if (client.readyState === WebSocket.OPEN) {
          objects.forEach((obj, objId) => {
						if (objId !== wsId) return;
		    		if (obj.type !== "player") return;

						let keys = data.keys;
						if (keys["KeyA"]) obj.vx += -obj.speed * (0.15 + obj.onGround)
	      		else if (keys["KeyD"]) obj.vx += obj.speed * (0.15 + obj.onGround);
	      		obj.vx = obj.vx * (obj.onGround ? 0.8 : 1);
	      		if (keys["Space"] && obj.onGround) {
	      			obj.vy = obj.jumpPower;
		      		obj.onGround = false;
		    		}
		  		});
        }
      }
    }

    if (data.type === "msg") msg(nickname, clients, data.text);

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
			ws.send(eval(data.msg));
		};
  });

	ws.on("close", () => {
  	console.log(`Client disconnected: ${clientId}`);
    clients.delete(clientId);
		objects.delete(clientId);
    msg("", clients, `${clients.get(clientId).nickname} disconnected from game`);
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
