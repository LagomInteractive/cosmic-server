/**
 * COSMIC game server, 2021 Olle Kaiser
 */

const game_port = 8881;
const website_port = 8882;

// Lowdb, the database https://github.com/typicode/lowdb
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const adapter = new FileSync("db.json");
const db = low(adapter);

// file-system, used to read and write files to disk
const fs = require("file-system");
const profanity_filter = JSON.parse(fs.readFileSync("profanity_filter.json"));

// Bcrypt for encrypting the passwords of users
var bcrypt = require("bcrypt");

function cryptPassword(password, callback) {
	bcrypt.genSalt(10, function (err, salt) {
		if (err) return callback(err);

		bcrypt.hash(password, salt, function (err, hash) {
			return callback(err, hash);
		});
	});
}

function comparePassword(plainPass, hashword, callback) {
	bcrypt.compare(plainPass, hashword, function (err, isPasswordMatch) {
		return err == null ? callback(null, isPasswordMatch) : callback(err);
	});
}

// Express for hosting the website
const http = require("http");
const express = require("express");
const app = express();

// Pug, for rendering the website
const pug = require("pug");
app.set("view engine", "pug");

app.use(express.static("dist"));
app.use(express.json({ limit: "100mb" }));
app.listen(website_port, () => {});

// Websocket, communication with game clients
const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: game_port });

// Nanoid for generating IDs and tokens for players (Replacing UUIDv4)
const { nanoid } = require("nanoid");

// Website pages
app.get("/", (req, res) => {
	res.render("index", { page_name: "home" });
});

app.get("/cards", (req, res) => {
	res.render("cards", { page_name: "cards" });
});

app.get("/download", (req, res) => {
	res.render("download", { page_name: "download" });
});

app.get("/source", (req, res) => {
	res.render("source", { page_name: "source" });
});

app.get("/login", (req, res) => {
	res.render("login", { page_name: "" });
});

// Website REST API
app.get("/api/user", (req, res) => {
	let user = Object.assign({}, getUser(req.query.username));
	if (user) {
		delete user.password;
		res.json(user);
	} else {
		res.json(null);
	}
});

app.post("/api/login", (req, res) => {});

app.post("/api/loginPass", (req, res) => {
	var user = getUser(req.body.username);
	if (user) {
		comparePassword(req.body.password, user.password, (err, match) => {
			console.log(user);
			if (match) {
				res.json({ success: true, token: createLoginToken(user.id) });
			} else {
				res.json({ success: false, reason: "Wrong password" });
			}
		});
	} else {
		if (req.body.username.length > 12) {
			res.json({
				success: false,
				reason: "Username is too long (Needs to be < 12)",
			});
		} else if (req.body.username.length < 3) {
			res.json({
				success: false,
				reason: "Username has to be 3 characters or longer",
			});
		} else if (req.body.username.replace(/\W/g, "") !== req.body.username) {
			res.json({
				success: false,
				reason: "Username contains illigal characters",
			});
		} else if (!filterUsername(req.body.username)) {
			res.json({
				success: false,
				reason:
					"A bad word was found in your username, please reconsider.",
			});
		} else if (req.body.password.length < 5) {
			res.json({
				success: false,
				reason: "Please use a longer password (At least 5 characters)",
			});
		} else {
			// User passed all tests and account can be created
			cryptPassword(req.body.password, (err, hash) => {
				let user = {
					id: nanoid(),
					username: req.body.username,
					password: hash,
					level: 1,
					xp: 0,
					cards: [],
				};

				db.get("users").push(user).write();
				res.json({ success: true, token: createLoginToken(user.id) });
			});
		}
	}
});

function filterUsername(username) {
	username = username.toLowerCase();
	for (var bad_word of profanity_filter) {
		if (username.indexOf(bad_word) != -1) {
			db.get("filtered_usernames")
				.push({ username, bad_word, date: Date.now() })
				.write();
			return bad_word;
		}
	}
	return true;
}

function createLoginToken(userID) {
	var token = nanoid();
	db.get("tokens").push({ token, user: userID, created: Date.now() }).write();
	return token;
}

// Game server
wss.on("connection", (ws) => {});

console.log(`Website started on port ${website_port}
Game started on port ${game_port}`);

db.defaults({
	cards: [],
	users: [],
	games: [],
	tokens: [],
	filtered_usernames: [],
}).write();

function getUser(username) {
	console.log("List:", db.get("users").value());
	for (let user of db.get("users").value()) {
		if (user.username.toLowerCase() == username.toLowerCase()) {
			return user;
		}
	}
}
