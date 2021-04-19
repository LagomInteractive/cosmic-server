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

const cards = low(new FileSync("cards.json"));

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
app.listen(website_port, () => { });

// Cookie parser is used to read and write cookies (for the website)
const cookieParser = require("cookie-parser");
app.use(cookieParser());

// Websocket, communication with game clients
const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: game_port });

// Nanoid for generating IDs and tokens for players (Replacing UUIDv4)
const { nanoid } = require("nanoid");
const { exit } = require("process");
const { FORMERR } = require("dns");

app.use((req, res, next) => {
    req.loggedIn = false;
    req.user = null;
    if (req.cookies.cosmic_login_token) {
        var token = db
            .get("tokens")
            .find({ token: req.cookies.cosmic_login_token })
            .value();
        if (token) {
            req.user = getUserFromID(token.user);
            if (req.user) req.loggedIn = true;
        }
    }
    if (!req.loggedIn)
        req.user = {
            id: 0,
        };
    next();
});

// Website pages
for (let page of ["home", "cards", "download", "source", "login"]) {
    app.get(page == "home" ? "/" : "/" + page, (req, res) => {
        res.render(page, {
            page_name: page,
            loggedIn: req.loggedIn,
            user: req.user,
        });
    });
}

app.get("/cards/edit/*", (req, res) => {
    res.render("edit", {
        loggedIn: req.loggedIn,
        user: req.user,
    });
});

app.get("/new", (req, res) => {
    if (req.loggedIn) {
        if (req.user.admin) {
            res.redirect("/cards/edit/" + cards.get("increment").value());
            cards.update("increment", (n) => n + 1).write();
            return;
        }
    }
    res.redirect("/");
});

app.get("/user/*", (req, res) => {
    var pageUsername = req.path.substr(req.path.lastIndexOf("/") + 1);
    var pageUser = getUser(pageUsername);
    if (pageUser) {
        res.render("user", {
            pageUser,
            loggedIn: req.loggedIn,
            user: req.user,
            pageUser,
        });
    } else {
        res.send("User not found :(");
    }
});

app.get("/deck/*", (req, res) => {
    res.render("deck", {
        loggedIn: req.loggedIn,
        user: req.user,
    })
})

// Website REST API
app.get("/api/cards", (req, res) => {
    res.json(cards.get("cards").value());
});

app.get("/api/deck", (req, res) => {
    var deck = db.get("decks").value()[req.query.id]
    if (deck) {
        var owner = getUserFromID(deck.owner)
        if (owner) {
            deck.owner_username = owner.username
            deck.id = req.query.id
            res.json(deck)
        }
    }
})

app.post("/api/deleteDeck", (req, res) => {
    var deck = db.get("decks").value()[req.body.id]
    if(deck){
        if(req.loggedIn && (req.user.id == deck.owner)){
            delete db.get("decks").value()[deck.id]
            db.write()
        }
    }
    res.end()
})

app.post("/api/deck", (req, res) => {

    var requestDeck = req.body.deck
    if (!requestDeck || !req.loggedIn) return

    var dbDeck = db.get("decks").value()[requestDeck.id]
    if (!dbDeck) return

    if(dbDeck.owner == req.user.id){
        if(requestDeck.title.length <= 30 && requestDeck.title.trim().length > 0){

            for(let id in requestDeck.cards){
                // Make sure the user has enough cards in their inventory
                if(req.user.cards[id] < requestDeck.cards[id]) return
                // Make sure every card amount is between 0-2
                if(requestDeck.cards[id] > 2 || requestDeck.cards[id] < 0) return
                
                // Deck is accepted, replacing the old deck
                dbDeck.title = requestDeck.title
                dbDeck.cards = requestDeck.cards
                db.write()
            }
        }
    }

    res.end()


})

app.get("/api/newdeck", (req, res) => {
    if (req.loggedIn) {
        let id = nanoid()
        db.get("decks").value()[id] = {
            title: "Untitled deck",
            cards: {},
            owner: req.user.id
        }
        db.write()
        res.redirect(`/deck/${id}`)
    } else {
        res.send("You have to be logged in to do this.")
    }
})

app.post("/api/give", (req, res) => {
    if (req.loggedIn && req.user.admin) {
        let allCards = cards.get("cards").value();
        let username = req.body.username;
        for (var i = 0; i < 10; i++) {
            let card = allCards[Math.floor(Math.random() * allCards.length)];
            giveCard(getUser(username).id, card.id)
            //db.get("users").find({ username }).value().cards.push();
            //db.write();
        }
    }
    res.end();
});

function giveCard(user, card) {
    var inventory = db.get("users").find({ id: user }).value().cards
    if (inventory[card]) inventory[card]++
    else inventory[card] = 1
    db.write()
}

function removeCard(user, card) {
    var inventory = db.get("users").find({ id: user }).value().cards
    if (inventory[card] && inventory[card] > 0) inventory[card]--;
    db.write()
}

app.post("/api/delete", (req, res) => {
    if (req.loggedIn && req.user.admin) {
        cards
            .get("cards")
            .value()
            .forEach((card, index) => {
                if (card.id === req.body.id) {
                    cards.get("cards").splice(index, 1).write();
                }
            });
    }
    res.end();
});

app.get("/backup", (req, res) => {
    res.download(__dirname + "/cards.json");
});

app.post("/api/upload", (req, res) => {
    if (req.loggedIn && req.user.admin) {
        req.body.image = req.body.image.replace(/^data:image\/png;base64,/, "");
        fs.writeFileSync(
            `dist/img/card-images/${req.body.id}.png`,
            req.body.image,
            "base64"
        );
    }
    res.end();
});

app.post("/api/card", (req, res) => {
    if (req.loggedIn && req.user.admin) {
        cards
            .get("cards")
            .value()
            .forEach((card, index) => {
                if (card.id === req.body.id) {
                    cards.get("cards").splice(index, 1).write();
                }
            });

        cards.get("cards").push(req.body).write();
    }
    res.end();
});

app.get("/api/user", (req, res) => {
    let user = getUser(req.query.username);
    if (user) {
        delete user.password;
        user.decks = []
        for(let id in db.get("decks").value()){
            let deck = clone(db.get("decks").value()[id])
            if(deck.owner == user.id){
                deck.id = id;
                user.decks.push(deck)
            }
        }
        res.json(user);
    } else {
        res.json(null);
    }
});

app.post("/api/logout", (req, res) => {
    res.cookie("cosmic_login_token", { expires: Date.now() });
    res.end();
});

app.post("/api/login", (req, res) => {
    var token = db.get("tokens").find({ token: req.body.token }).value();
    if (token) {
        var user = getUserFromID(token.user);
        delete user.password;
        res.json({ user });
    } else {
        res.end();
    }
});

app.get("/api/assets", (req, res) => {
    var commands = ""
    for (let card of cards.get("cards").value()) {
        commands += `curl https://cosmic.ygstr.com/img/card-images/${card.id}.png --output ${card.id}.png<br>`
    }
    res.send(commands)
})

app.post("/api/loginPass", (req, res) => {
    var user = getUserWithPassword(req.body.username);
    if (user) {
        comparePassword(req.body.password, user.password, (err, match) => {
            if (match) {
                var token = createLoginToken(user.id);
                res.cookie("cosmic_login_token", token, {
                    expires: new Date(253402300000000),
                });
                res.json({ success: true, token });
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
                    admin: false,
                    record: {
                        wins: 0,
                        losses: 0,
                    },
                };

                db.get("users").push(user).write();
                var token = createLoginToken(user.id);
                res.cookie("cosmic_login_token", token, {
                    expires: new Date(253402300000000),
                });
                res.json({ success: true, token });
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

var games = [

]

const GAME = {
    id: nanoid(),
    players: [],
    gameStarted: 0,
    roundStarted: 0,
    roundLength: 60,
    round: 0,
}

const PLAYER = {
    id: nanoid(),
    socket: null,
    name: "Test",
    hp: 0,
    cards: [],
    minions: [],
    buff: {
        sacrifices: 0,
        element: null
    },
    hasAttacked: false,
    hasBeenAttacked: false,
    manaLeft: 0,
    totalMana: 0,
    isBot: false,
    profile: null
}

function createNewGame(user1, user2 = false) {

    var game = clone(GAME)

    var player1 = createPlayer(user1)

    var player2 = clone(PLAYER)
    player2.isBot = true;
    player2.name = "Bot"
    player2.id = nanoid()

    game.players = [player1, player2]
    game.gameStarted = Date.now()

    games.push(game)

    startGame(game.id)
}

function startGame(id) {
    var game = getGame(id)
    emitToPlayers(game)
}

function emitToPlayers(g) {
    return
    var game = clone(g)
    for (let player of game.players) {
        delete player.socket
    }

    for (let player of g.players) {
        player.socket.send(Pack("game_update", JSON.stringify(game)))
    }
}

function getGame(id) {
    for (let game of games) {
        if (game.id == id) return game;
    }
    return null;
}

function createPlayer(user) {
    var player = clone(PLAYER)
    player.name = user.profile.username
    player.id = user.profile.id
    player.profile = user.profile
    player.socket = user.profile.socket
    return player
}


// Game server
wss.on("connection", (ws) => {
    ws.on("message", (message) => {
        var package = JSON.parse(message)
        switch (package.identifier) {
            case "start_test":
                /* createNewGame({
                    profile: getUserFromToken(package.token),
                    socket: ws
                }, false) */
                break;
            case "login":
                var existingToken = db.get("tokens").find({ token: package.token }).value()
                if (existingToken) {
                    ws.send(Pack("user", JSON.stringify(getUserFromID(existingToken.user))))
                } else {
                    let id = nanoid()
                    let user = {
                        id: id,
                        username: "Guest_" + id,
                        password: nanoid(),
                        level: 1,
                        xp: 0,
                        cards: {},
                        admin: false,
                        record: {
                            wins: 0,
                            losses: 0,
                        },
                    };

                    db.get("users").push(user).write();
                    var token = createLoginToken(user.id);
                    ws.send(Pack("new_token", token))
                }
                break;

        }

    })

    ws.send(Pack("cards", getUnityCards()))
});


/* Gets all cards but in the format for Unity
   Removes events and unnecessary card info
   Converts the Bold and Italics styles to Unity rich text */
function getUnityCards() {
    var unityCards = clone(cards.get("cards").value())
    for (let card of unityCards) {
        delete card.events
        delete card.lastChange
        let description = card.description

        var result = ""
        var bold = false;
        var italic = false;

        for (var i = 0; i < description.length; i++) {
            let char = description[i]
            let next = description[i + 1]
            if (!next) next = ""
            if (next) next = next.toUpperCase()
            if (char == "$") {
                i++; // Skip the next character
                result += `<${(next == 'B' && bold || next == 'I' && italic) ? '/' : ''}${next.toLowerCase()}>`
                next == 'B' ? bold = !bold : italic = !italic;
            } else {
                result += char
            }
        }

        if (bold) result += "</b>"
        if (italic) result += "</i>"

        card.description = result
    }
    return JSON.stringify(unityCards)
}


function Pack(identifier, packet) {
    return JSON.stringify({
        identifier, packet
    })
}

console.log(`Website started on port ${website_port}
Game started on port ${game_port}`);

cards.defaults({ cards: [], increment: 0 }).write();

db.defaults({
    users: [],
    games: [],
    tokens: [],
    decks: {},
    filtered_usernames: [],
}).write();

function getUserFromToken(token) {
    var existingToken = db.get("tokens").find({ token }).value()
    if (existingToken) {
        var user = db.get("users").find({ id: existingToken.user }).value()
        if (user) {
            var userWithoutPass = clone(user)
            delete userWithoutPass.password
            return userWithoutPass
        }
    }
    return null
}

function getUserFromID(id) {
    var userWithoutPass = clone(db.get("users").find({ id }).value());

    delete userWithoutPass.password;
    return userWithoutPass;
}

function getUserWithPassword(username) {
    for (let user of db.get("users").value()) {
        if (user.username.toLowerCase() == username.toLowerCase()) {
            return clone(user);
        }
    }
}

function clone(obj) {
    return JSON.parse(JSON.stringify(obj))
}

function getUser(username) {
    var userWithoutPass = getUserWithPassword(username);
    if (userWithoutPass) {
        delete userWithoutPass.password;
        return userWithoutPass;
    }
}
