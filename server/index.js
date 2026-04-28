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
let newCollisionModel = true;

const objects = new Map();
objects.set("bottom", new Obj(-500000, 100, 1000000, 10000, "static", "box"));
objects.set("text", new Text("Spawn", "black", new Obj(50, -100, 0, 0, "none", "text")));

function update() {
	objects.forEach((obj, name) => {
		if (obj.mode === "dynamic") obj.vy += gravity;
		obj.vx = Math.round((obj.vx*(!obj.onGround ? 0.99 : 0.8))*1000)/1000;
		obj.vy = Math.round((obj.vy*0.99)*1000)/1000;

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
			if (obj1.mode == "static" || obj1.mode == "none") return;
			if (obj2.mode == "none") return;

			obj.onGround = false;
			if (checkUnderCollision(obj) && obj1.mode != "none") obj.onGround = true;

			objRealX1 = obj1.x+obj1.width/2;
			objRealY1 = obj1.y+obj1.height/2;
			objRealX2 = obj2.x+obj2.width/2;
			objRealY2 = obj2.y+obj2.height/2;

			objRelativeX1 = (objRealX1 - objRealX2) / (obj2.width / 100);
			objRelativeY1 = (objRealY1 - objRealY2) / (obj2.height / 100);
			if (objInRegion(obj1, obj2.x, obj2.y, obj2.width, obj2.height)) {
				if (newCollisionModel) {
				if (Math.abs(objRelativeX1) < Math.abs(objRelativeY1)) {
					if (objRelativeY1 < 0) {
						if (obj1.mode == "dynamic") {obj2.vx = obj1.vx; obj2.vy = obj1.vy}
						obj1.vy /= 4;
						obj1.y = obj2.y - obj1.height;
					} else {
						if (obj1.mode == "dynamic") {obj2.vx = obj1.vx; obj2.vy = obj1.vy}
						obj1.vy /= 4;
						obj1.y = obj2.y + obj2.height;
					}
				} else {
					if (objRelativeX1 < 0) {
						if (obj1.mode == "dynamic") {obj2.vx = obj1.vx; obj2.vy = obj1.vy}
						obj1.vx /= 4;
						obj1.x = obj2.x - obj1.width;
					} else {
						if (obj1.mode == "dynamic") {obj2.vx = obj1.vx; obj2.vy = obj1.vy}
						obj1.vx /= 4;
						obj1.x = obj2.x + obj2.width;
					}
				}
				} else {
				if (objInRegion(obj1, obj2.x+5, obj2.y, obj2.width-10, obj2.height/2)) {
					if (obj1.mode == "dynamic") {obj2.vx = obj1.vx; obj2.vy = obj1.vy}
					obj1.vy /= 4;
					obj1.y = obj2.y - obj1.height;
				} else if (objInRegion(obj1, obj2.x+5, obj2.y+obj2.height/2, obj2.width-10, obj2.height/2)) {
					if (obj1.mode == "dynamic") {obj2.vx = obj1.vx; obj2.vy = obj1.vy}
					obj1.vy /= 4;
					obj1.y = obj2.y + obj2.height;
				}
				if (objInRegion(obj1, obj2.x, obj2.y+5, obj2.width/2, obj2.height-10)) {
					if (obj1.mode == "dynamic") {obj2.vx = obj1.vx; obj2.vy = obj1.vy}
					obj1.vx /= 4;
					obj1.x = obj2.x - obj1.width;
				} else if (objInRegion(obj1, obj2.x+obj2.width/2, obj2.y+5, obj2.width/2, obj2.height-10)) {
					if (obj1.mode == "dynamic") {obj2.vx = obj1.vx; obj2.vy = obj1.vy}
					obj1.vx /= 4;
					obj1.x = obj2.x + obj2.width;
				}
				}
			}
		});
	});
}

let customUpdate = () => {};

function objInRegion(obj, x, y, width, height) {
	return (
		obj.x < x + width &&
		obj.x + obj.width > x &&
		obj.y < y + height &&
		obj.y + obj.height > y
	)
}

function posInObj(x, y, obj) {
	return (
		x < obj.x + obj.width &&
		x > obj.x &&
		y < obj.y + obj.height &&
		y > obj.y
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

function Obj(x, y, width, height, mode, type, color = "black") {
	this.x = x;
	this.y = y;
	this.width = width;
	this.height = height;
	this.vx = 0;
	this.vy = 0;
	this.mode = mode;
	this.type = type;
	this.color = color;
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

function Text(text, textColor, obj) {
	for (let i in obj) {
		this[i] = obj[i]
	}
	this.text = text;
	this.textColor = textColor;
}

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

let frames = 0;
let framestosync = 0;
let iferrorframestotryagain = 0;
let fps = 60;

function gameLoop() {
	framestosync = Math.ceil(objects.size/10);
	frames++;
	update();

	if (iferrorframestotryagain <= 0) {
		try {customUpdate()} catch (err) {
			iferrorframestotryagain = 15*fps;
			msg("", clients, err);
		}
	} else iferrorframestotryagain--;

	if (frames % framestosync == 0) server_sync();
}

setInterval(gameLoop, 1000 / fps);
console.log("The game was successful initializated");

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
						let nickname = data.nickname;
						if (!(nickname.length > 3 && nickname.length < 20)) {
							ws.close(4011);
							return;
						}

						let editNickname = "";
						const search = `АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890!"№;%:?*()_+@#$^&-=.\\[]{}<>\`~`;
						for (let i = 0; i < nickname.length; i++) {
							if (search.includes(nickname[i])) editNickname += nickname[i];
						}
						nickname = editNickname;

						ws.send(JSON.stringify({
    					type: "init",
    					clientId,
							nickname,
							nickname,
 						}));
						clients.get(id).nickname = nickname;
						objects.set(id, new Player(nickname, 1.4, -16, new Obj(0, 0, 40, 100, "dynamic", "player", "#000000")));
						msg("", clients, `${nickname} connected to game`);
						clients.get(id).joined = true;
						break;
					}
      	}
			} else {
				ws.close(4002);
			}
    };

    if (data.type === "sync") {
      if (ws.readyState === WebSocket.OPEN) {
        objects.forEach((obj, objId) => {
					if (objId === myid) {
						let keys = data.keys;
						clients.get(myid).mouseX = data.mouseX;
						clients.get(myid).mouseY = data.mouseY;
						let tmpspeed = obj.speed * (obj.onGround ? 1 : 0.1);

						if (keys["KeyA"]) obj.vx += -tmpspeed;
	      		else if (keys["KeyD"]) obj.vx += tmpspeed;
	      		if (keys["Space"] && obj.onGround) {
	      			obj.vy = obj.jumpPower;
		      		obj.onGround = false;
		    		}
					}
		  	});
      }
    }

    if (data.type === "msg") {
			if (data.text.length < 200) {
				msg(clients.get(myid).nickname, clients, data.text);
			} else {
				ws.close(4012);
			}
		}

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
			if (data.password !== process.env.console_password) ws.close(4001);
			let result;
			try {
				result = eval(data.msg);
				try {result = JSON.stringify(result)} catch {result = String(result)};
			} catch (err) {result = "Got error: "+err};
			ws.send(JSON.stringify({
				type: "msg",
				text: result,
			}))
		};

		if (data.type === "i_break") {
			let x = objects.get(myid).x + objects.get(myid).width/2 + clients.get(myid).mouseX;
			let y = objects.get(myid).y + objects.get(myid).height/2 + clients.get(myid).mouseY;
			objects.forEach((obj, id) => {
				if (posInObj(x, y, obj) && typeof(id) == "number" && obj.type != "player") objects.delete(id);
			})
		};

		if (data.type === "i_build") {
			let x = objects.get(myid).x + objects.get(myid).width/2 + clients.get(myid).mouseX;
			let y = objects.get(myid).y + objects.get(myid).height/2 + clients.get(myid).mouseY;
			x = Math.floor(x/50)*50;
			y = Math.floor(y/50)*50;

			let cursorInObjs = false;
			objects.forEach((obj, id) => {
				if (posInObj(x+25, y+25, obj)) {cursorInObjs = true};
			});
			if (!cursorInObjs) objects.set(Math.floor(Math.random() * 100000), new Obj(x, y, 50, 50, "static", "box"));
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
});

server.listen(PORT, () => {
  console.log("HTTPS server started on port ", PORT);
});
