/**
 * COSMIC game server, 2021 Olle Kaiser
 */

const SERVER_VERSION = "2.6";
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


var onlinePings = {}
var matchmaking = {}


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

app.get("/todo", (req, res) => {
    res.end(fs.readFileSync("TODO.md"));
})

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
    if (deck) {
        if (req.loggedIn && (req.user.id == deck.owner)) {
            delete db.get("decks").value()[deck.id]
            db.write()
        }
    }
    res.end()
})

app.post("/api/deck", (req, res) => {

    var maxDeckSize = 30;
    var requestDeck = req.body.deck
    if (!requestDeck || !req.loggedIn) return

    var dbDeck = db.get("decks").value()[requestDeck.id]
    if (!dbDeck) return

    if (dbDeck.owner == req.user.id) {
        if (requestDeck.title.length <= 30 && requestDeck.title.trim().length > 0) {
            var totalCards = 0;
            for (let id in requestDeck.cards) {
                // Make sure the user has enough cards in their inventory
                if (req.user.cards[id] < requestDeck.cards[id]) return
                // Make sure every card amount is between 0-2
                if (requestDeck.cards[id] > 2 || requestDeck.cards[id] < 0) return
                totalCards += Number(requestDeck.cards[id])
            }
            if (totalCards <= maxDeckSize) {
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

app.get("/api/users", (req, res) => {
    var users = db.get("users").value()
    var send = []
    clearPings()
    for (let user of users) {
        send.push({
            status: onlinePings[user.id] ? onlinePings[user.id].status : "offline",
            username: user.username,
            admin: user.admin
        })
    }

    send.sort((a, b) => {
        if (PING_PRIORITY.indexOf(a.status) - PING_PRIORITY.indexOf(b.status) != 0) return PING_PRIORITY.indexOf(a.status) - PING_PRIORITY.indexOf(b.status)
        if (a.username > b.username) return 1;
        if (a.username < b.username) return -1
        return 0
    })

    res.json(send)
})

app.get("/api/user", (req, res) => {
    let user = getUser(req.query.username);
    if (user) {
        delete user.password;
        user.decks = []
        for (let id in db.get("decks").value()) {
            let deck = clone(db.get("decks").value()[id])
            if (deck.owner == user.id) {
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
        pingUser(user.id, "website")
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

app.post("/api/ping", (req, res) => {
    res.end()
    if (req.loggedIn) pingUser(req.user.id, "website")
})

const PING_PRIORITY = ["game", "website", "offline"]

function pingUser(id, status) {
    // Clear all pings that would be considered offline now (3 > seconds old)
    clearPings()
    // Only replace online status if the priority is higher (replace website online if also online in game 
    if (onlinePings[id] && PING_PRIORITY.indexOf(onlinePings[id].status) < PING_PRIORITY.indexOf(status)) return
    onlinePings[id] = {
        date: Math.round(Date.now() / 1000),
        status: status
    }
}

// Clear all pings that would be considered offline now (3 > seconds old)
function clearPings() {
    for (let key in onlinePings) {
        if (onlinePings[key].status != "game" && (Date.now() / 1000) - onlinePings[key].date > 3)
            // Not pinged for more than 3 seconds
            delete onlinePings[key];
    }
}

app.post("/api/deleteUser", (req, res) => {
    if (req.loggedIn && req.user.admin) {
        var user = getUserWithPassword(req.user.username)
        comparePassword(req.body.password, user.password, (err, match) => {
            if (match) {
                var deleteUser = getUser(req.body.username)
                if (deleteUser) {

                    while (db.get("tokens").find({ user: deleteUser.id }).value()) {

                        for (let i = 0; i < db.get("tokens").value().length; i++) {
                            if (db.get("tokens").value()[i].user == deleteUser.id) {
                                db.get("tokens").value().splice(i, 1)
                                db.write()
                            }
                        }
                    }

                    for (var i = 0; i < db.get("users").value().length; i++) {
                        if (db.get("users").value()[i].id == deleteUser.id) {
                            db.get("users").value().splice(i, 1)
                            db.write()
                        }
                    }

                    console.log("Deleted user " + deleteUser.username)

                }
            }
        });
    }
    res.end()
})

app.post("/api/admin", (req, res) => {

    if (req.loggedIn && req.user.admin) {
        var user = getUser(req.body.username)
        if (user) {
            db.get("users").find({ id: user.id }).value().admin = !user.admin
            db.write()
        }
    }
    res.end()

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
        createUser(req.body.username, req.body.password, result => {
            if (result.success) {
                res.cookie("cosmic_login_token", result.token, {
                    expires: new Date(253402300000000),
                });
            }
            res.json(result);
        })

    }
});

function createUser(username, password, callback) {
    if (username.length > 12) {
        callback({
            success: false,
            reason: "Username is too long (Needs to be < 12)",
        })
    } else if (username.length < 3) {
        callback({
            success: false,
            reason: "Username has to be 3 characters or longer",
        })
    } else if (username.replace(/\W/g, "") !== username) {
        callback({
            success: false,
            reason: "Username contains illigal characters",
        })
    } else if (!filterUsername(username)) {
        callback({
            success: false,
            reason:
                "A bad word was found in your username, please reconsider.",
        })
    } else if (password.length < 5) {
        callback({
            success: false,
            reason: "Please use a longer password (At least 5 characters)",
        })
    } else {
        // User passed all tests and account can be created
        cryptPassword(password, (err, hash) => {
            let user = {
                id: nanoid(),
                username: username,
                password: hash,
                level: 1,
                xp: 0,
                cards: [],
                admin: false,
                record: {
                    wins: 0,
                    losses: 0,
                },
                joined: Date.now()
            };

            db.get("users").push(user).write();
            var token = createLoginToken(user.id);
            callback({ success: true, token });
        });
    }
}

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

var roundCountdowns = {}

const GAME = {
    id: nanoid(),
    players: [],
    gameStarted: 0,
    roundStarted: 0,
    roundLength: 60,
    round: 0,
    turn: 0,
    events: []
}

const PLAYER = {
    id: nanoid(),
    socket: null,
    name: "Test",
    hp: 0,
    cards: [],
    deck: [],
    minions: [],
    buff: {
        sacrifices: 0,
        element: "nova"
    },
    isAttacking: false,
    hasAttacked: false,
    hasBeenAttacked: false,
    manaLeft: 0,
    totalMana: 0,
    isBot: false,
    profile: null,
    turn: false,
}

const MINION = {
    id: nanoid(),
    hp: 0,
    isAttacking: false,
    hasAttacked: false,
    hasBeenAttacked: false,
    buff: null,
    origin: null,
    spawnRound: 0,
    canSacrifice: false,
    owner: null,
    battlecryActive: false
}

// DELETE GUESTS
/* for (let i = 0; i < db.get("users").value().length; i++) {
    if (db.get("users").value()[i].username.indexOf("Guest_") != -1) {
        db.get("users").value().splice(i, 1)
        db.write()
        console.log("Deleted")
    }
}
*/


// Create a new online or bot game
function createNewGame(user1, user2 = false) {

    var game = clone(GAME)
    game.id = nanoid()

    var player1 = createPlayer(user1)
    var player2 = user2 ? createPlayer(user2) : createBot();

    player2.turn = true;

    game.players = [player1, player2]
    game.gameStarted = Date.now()


    //var deckID = "LSg-i8pSnQrORTEnrFBb9" // Iszy
    //var deckID = "99ZUTIj2CraDV-OOxPxte" // OLLES


    for (let player of game.players) {
        player.deck = shuffle(player.deck)
    }

    games.push(game)
    startGame(game.id)
}

function terminateGame(id, loserId) {
    var game = getGame(id)
    if (!game) return
    if (roundCountdowns[id]) {
        clearTimeout(roundCountdowns[id])
        delete roundCountdowns[id]
    }
    var winner;
    for (let player of game.players) {
        if (player.id != loserId) winner = player.id
    }
    addEvent(game, "game_over", { winner })
    emitGameUpdate(game)

    for (let i = 0; i < games.length; i++) {
        if (games[i].id == id) {
            games.splice(i, 1)
            break;
        }
    }

    console.log("Terminating game " + id + " total active games: " + games.length)
}


function startGame(id) {
    var game = getGame(id)
    game.gameStarted = Date.now()
    addEvent(game, "game_start")

    for (let player of game.players) {
        dealCards(id, player.id, 5);
        player.hp = 30;
        player.maxHp = player.hp;
    }

    console.log("Starting game with " + game.players[0].name + " and " + game.players[1].name)
    emitGameUpdate(game)

    setTimeout(() => {
        nextTurn(id)
    }, 500)
}

function runBot(gameid) {
    var game = getGame(gameid);
    for (var player of game.players) {
        if (player.turn && player.isBot) {

            // Check if bot can play any cards
            for (var i = 0; i < player.cards.length; i++) {
                var card = getCard(player.cards[i]);
                if (card.mana <= player.manaLeft && card.type == "minion") {
                    playMinion(gameid, player.id, i)
                    return
                }
            }

            var attacker;
            var target;
            for (let minion of player.minions) {
                if (!minion.hasAttacked && (minion.spawnRound != game.round || minion.element == "rush")) {
                    attacker = minion;
                    break;
                }
            }

            if (attacker) {
                for (let opponent of game.players) {
                    if (opponent.id != player.id) {
                        // Is opponent
                        var opponentHasTaunt = false;
                        for (let minion of opponent.minions) if (minion.element == "taunt") opponentHasTaunt = true;

                        for (let minion of opponent.minions) {

                            if (!opponentHasTaunt || minion.element == "taunt") {
                                target = minion;
                                break;
                            }
                        }

                        if (target == null) target = opponent
                    }

                    attack(game.id, player.id, attacker.id, target.id)
                    return
                }
            }


        }
    }

    nextTurn(gameid)
}

function nextTurn(id) {

    if (roundCountdowns[id]) clearTimeout(roundCountdowns[id])
    var game = getGame(id)
    if (!game) return

    if (game.turn % 2 == 0) game.round++;
    game.turn++;
    game.roundStarted = Date.now()

    // Change turn
    var attackingPlayer = ""
    var attackingPlayerIsBot = false;
    for (let player of game.players) {
        player.turn = !player.turn
        if (player.turn) {
            if (player.isBot) attackingPlayerIsBot = true;
            attackingPlayer = player.id;
            // Give the attacking player a new card at the start of the round
            dealCards(id, player.id)
            player.totalMana = 9//game.round > 9 ? 9 : game.round
            player.manaLeft = player.totalMana

            // Add buff
            if (player.buff) {
                if (player.buff.sacrifices >= 3) {
                    switch (player.buff.element) {
                        case "lunar":
                            player.totalMana += 2;
                            player.manaLeft += 2;
                            break;
                        case "solar":
                            for (let minion of player.minions) {
                                heal(game, minion, 2)
                            }
                            break;
                        case "zenith":
                            dealCards(game.id, player.id, 1)
                            break;
                        case "nova":
                            for (let minion of player.minions) {
                                changeAttackDamage(game, minion, 1)
                            }
                            break;
                    }
                }
            }
        }

        player.isAttacking = player.turn
        for (let minion of player.minions) {
            minion.isAttacking = player.turn;
            minion.hasAttacked = false;
            minion.hasBeenAttacked = false;
            minion.battlecryActive = false;

            if (player.turn) {
                var minionCard = getCard(minion.origin)
                if (minionCard.events.everyRound)
                    for (let func of minionCard.events.everyRound) {
                        runFunction(game, func, false, player)
                        endOfAction(game.id)
                    }
            }
        }
    }

    addEvent(game, "next_turn", {
        "attacking_player": attackingPlayer
    })
    emitGameUpdate(game)

    if (attackingPlayerIsBot) {
        let botRound = game.round;
        let botRunner = setInterval(() => {

            game = getGame(game.id)
            if (game) {
                for (let player of game.players) {
                    if (player.isBot && player.turn && botRound == game.round) {
                        runBot(game.id)
                        return
                    }
                }
            }
            // Stop the bot because its done.
            clearInterval(botRunner)
        }, 800)
    }

    roundCountdowns[id] = setTimeout(() => {
        nextTurn(game.id)
    }, game.roundLength * 1000)
}

// Deals one or more cards to a player in the game
function dealCards(game_id, player_id, amount = 1) {
    var game = getGame(game_id)
    for (let player of game.players) {
        if (player.id == player_id) {
            for (let i = 0; i < amount; i++) {
                // Get the card to deal to the player
                if (player.deck.length > 0) {
                    var card = player.deck[0]
                    if (player.cards.length < 8) {
                        player.cards.push(card)
                        addEvent(game, "player_deal_card", {
                            player: player.id,
                            card
                        })
                    }
                    // Delete the card from the players deck
                    player.deck.splice(0, 1)
                } else {
                    console.log("Player has no cards left")
                    // PLAYER HAS RUN OUT OF CARDS TODO:
                }
            }
        }
    }

}

function addEvent(game, identifier, values = {}) {
    game.events.push({
        identifier,
        values
    })
}

// Emit the entire game info to all players in the game
function emitGameUpdate(g) {

    for (let player of g.players) {

        // Dont send updates to bots
        if (player.isBot) continue;

        let game = clone(g)
        for (let playerCopy of game.players) {
            delete playerCopy.socket
            if (player.id != playerCopy.id) {
                // Clear enemy player deck and cards so that you cannot
                // cheat.
                for (let i = 0; i < playerCopy.deck; i++) {
                    playerCopy.deck[i] = 0
                }
                for (let i = 0; i < playerCopy.cards; i++) {
                    playerCopy.cards[i] = 0
                }
            }
        }
        player.socket.send(Pack("game_update", JSON.stringify(game)))
    }

    g.events = []
}

function getGame(id) {
    for (let game of games) {
        if (game.id == id) return game;
    }
    return null;
}

function getGameIdFromUserId(user_id) {
    for (let game of games) {
        for (let player of game.players) {
            if (player.id == user_id) {
                return game.id
            }
        }
    }
    return null
}

function createBot(deck) {
    var bot = clone(PLAYER)
    // Player 1 will be attacking first.
    // When the round start, the attacking player is flipped
    bot.isBot = true;
    bot.name = "Bot"
    bot.id = nanoid()
    addDeck(bot, deck)
    return bot;
}

function addDeck(player, deck) {

    // If deck is missing
    if (!deck) deck = db.get("decks").find({ id: '99ZUTIj2CraDV-OOxPxte' }).value()

    for (let key in deck.cards) {
        for (let i = 0; i < Number(deck.cards[key]); i++) {
            player.deck.push(Number(key));
        }
    }
}

function createPlayer(user) {

    var player = clone(PLAYER)

    addDeck(player, user.deck)
    player.name = user.profile.username
    player.id = user.profile.id
    player.profile = user.profile

    let playerCards = []
    for (let key in player.profile.cards) {
        for (let i = 0; i < Number(player.profile.cards[key]); i++) {
            playerCards.push(Number(key));
        }
    }

    player.profile.cards = playerCards;

    player.socket = user.socket
    return player
}

function getCard(cardId) {
    return cards.get("cards").find({ id: String(cardId) }).value()
}

const ELEMENTS = ["lunar", "solar", "zenith", "nova"]

function sacrifice(gameId, userId, minionId) {
    var game = getGame(gameId)
    if (!game) return
    var player = getCharacter(game, userId)
    var minion = getCharacter(game, minionId)


    if (player.turn &&
        // If the minion has ever attacked someone, it cannot be sacrificed
        !minion.hasEverAttacked
        // Only an elemental minion can be sacrificed
        && ELEMENTS.indexOf(minion.element) != -1) {
        addEvent(game, "minion_sacrificed", {
            id: minion.id
        })

        // Delete the minion from the player.
        for (let i = 0; i < player.minions.length; i++) {
            if (player.minions[i].id == minionId) player.minions.splice(i, 1);
        }

        if (player.buff.element == minion.element) {
            player.buff.sacrifices++;
            if (player.buff.sacrifices > 5) player.buff.sacrifices = 5;
        } else player.buff = {
            element: minion.element,
            sacrifices: 1
        }
    }

    emitGameUpdate(game)
}

function battlecry(gameId, userId, info) {

    info = JSON.parse(info)
    var game = getGame(gameId)
    if (!game) return
    var player = getCharacter(game, userId)
    var origin = getCharacter(game, info.origin)
    var target = getCharacter(game, info.target)

    if (player && origin && target) {
        if (origin.battlecryActive) {

            var originCard = getCard(origin.origin)
            // Success is true if any of the functions run. If no functions run, the user 
            // most likley did a mistake and no actions where done, so they get to try again.
            var success = false;
            for (let func of originCard.events.onPlayedTarget) {
                if (runFunction(game, func, target, player)) success = true;
                endOfAction(game.id)
            }
            if (success) origin.battlecryActive = false;
        }
    }

    endOfAction(game.id)
    emitGameUpdate(game)
}


function changeAttackDamage(game, target, damageAmount) {
    target.damage = Number(target.damage) + Number(damageAmount);
    if (target.damage < 0) target.damage = 0;
    addEvent(game, "damage_change", {
        id: target.id,
        change: damageAmount
    })
}

/**
 * Run a card function from an event
 * @param {*} game The game the function is run in
 * @param {*} func The function
 * @param {*} target The target character or if not a target function the player sending it.
 */
function runFunction(game, func, target = null, player = null) {
    console.log("Function run: " + func.func + " , val: " + func.value)
    func.value = Number(func.value)
    switch (func.func) {
        case "changeTargetAttack":
            if (target.origin) {
                changeAttackDamage(game, target, func.value)
            }
            break;
        case "damageTarget":
            damage(game, target, func.value)
            break;
        case "damageRandomAlly":
            var targetIndex = Math.floor(Math.random() * player.minions.length) - 1
            var target = targetIndex == -1 ? player : player.minions[targetIndex]
            damage(game, target, func.value)
            break;
        case "changeAllyUnitsMaxHp":
            for (let minion of player.minions) {
                minion.maxHp = Number(minion.maxHp) + func.value;
                heal(game, minion, func.value)
            }
            break;
        case "damageRandomAllyUnit":
            if (player.minions.length == 0) return false;
            var targetIndex = Math.floor(Math.random() * player.minions.length)
            var target = player.minions[targetIndex]
            damage(game, target, func.value)
            break;
        case "damageEveryOpponent":
            var opponent = getOpponent(game, player.id)
            damage(game, opponent, func.value)
            for (let minion of opponent.minions) {
                damage(game, minion, func.value)
            }
            break;
        case "healTarget":
            heal(game, target, func.value)
            break;
        case "changeTargetMaxHp":
            target.maxHp = Number(target.maxHp) + func.value
            heal(game, target, func.value);
            break;
        case "healRandomAlly":
            var targetIndex = Math.floor(Math.random() * player.minions.length) - 1
            var target = targetIndex == -1 ? player : player.minions[targetIndex]
            heal(game, target, func.value)
            break;
        case "healEveryAlly":
            heal(game, player, func.value)
            for (let minion of player.minions) {
                heal(game, minion, func.value)
            }
            break;
        case "spawnMinion":
            var card = getCard(func.value)
            spawnMinion(game, card, player)
            break;
        case "gainMana":
            player.manaLeft += func.value;
            break;
        case "drawAmountCards":
            dealCards(game.id, player.id, func.value);
            break;
        case "drawCard":
            player.cards.push(func.value)
            addEvent(game, "player_deal_card", {
                player: player.id,
                card: func.value
            })
            break;
        case "damageTargetUnit":
            if (target.origin) {
                damage(game, target, func.value)
            } else return false;
            break;
        case "damageOpponent":
            var opponent = getOpponent(game, player.id)
            damage(game, opponent, func.value)
            break;
        case "damageRandomOpponent":
            var opponent = getOpponent(game, player.id)
            var targetIndex = Math.floor(Math.random() * opponent.minions.length) - 1
            var target = targetIndex == -1 ? opponent : opponent.minions[targetIndex]
            damage(game, target, func.value)
            break;
        case "damageRandomEnemyUnit":
            var opponent = getOpponent(game, player.id)
            if (opponent.minions.length == 0) return false;
            var targetIndex = Math.floor(Math.random() * opponent.minions.length)
            var target = opponent.minions[targetIndex]
            damage(game, target, func.value)
            break;
        case "healPlayer":
            player.hp += func.value
            if (player.hp > 30) player.hp = 30;
            break;
        case "damageAllUnits":
            var pool = []
            for (let p of game.players) {
                for (let minion of p.minions) {
                    pool.push(minion)
                }
            }
            for (let minion of pool) {
                damage(game, minion, func.value)
            }
            break;
        case "damageRandomAnything":
            var pool = []
            for (let player of game.players) {
                pool.push(player)
                for (let minion of player.minions) {
                    pool.push(minion)
                }
            }
            var target = pool[Math.floor(Math.random() * pool.length)]
            damage(game, target, func.value)
            break;
        case "damageRandomUnit":
            var allUnits = []
            for (let player of game.players) {
                for (let minion of player.minions) {
                    allUnits.push(minion)
                }
            }
            if (allUnits.length == 0) return false;
            var target = allUnits[Math.floor(Math.random() * allUnits.length)]
            damage(game, target, func.value)
            break;
    }

    endOfAction(game.id)
    return true;
}


function heal(game, target, hp) {
    target.hp += hp;
    if (target.hp > target.maxHp) target.hp = target.maxHp;
    addEvent(game, "heal", {
        id: target.id,
        hp
    })
}

function damage(game, target, damage) {
    if (!target) return;
    target.hp -= damage;
    addEvent(game, "damage", {
        id: target.id,
        damage
    })

    var owner = target.owner ? getCharacter(game, target.owner) : target

    endOfAction(game.id)
    // emitGameUpdate(game)

    if (target.origin) {
        var card = getCard(target.origin)
        if (card.events.onAttacked) for (let func of card.events.onAttacked) runFunction(game, func, target, owner)
    }
}

function getCharacter(game, characterId) {
    if (!game) return;
    for (let player of game.players) {
        if (player.id == characterId) return player;
        for (let minion of player.minions) {
            if (minion.id == characterId) return minion;
        }
    }
}

function getOpponent(game, playerId) {
    var character = getCharacter(game, playerId)
    for (let player of game.players) {
        if (!character.origin && player.id != playerId) return player;
        for (let minion of player.minions) {
            if (minion.id == character.id) {
                return getOpponent(game, player.id)
            }
        }
    }
}

function playSpell(gameId, userId, info) {

    info = JSON.parse(info)
    var game = getGame(gameId)
    if (!game) return
    for (let player of game.players) {
        if (player.id == userId) {
            var card = getCard(player.cards[info.index])
            if (!card || card.mana > player.manaLeft) return

            player.manaLeft -= card.mana;
            player.cards.splice(info.index, 1);


            addEvent(game, "card_used", {
                player: player.id,
                index: info.index,
                card: card.id
            })

            if (card.type == "targetSpell") {
                if (card.events.action) {
                    var target = getCharacter(game, info.target)
                    for (let func of card.events.action) {
                        runFunction(game, func, target, player)
                    }
                }
            } else {
                // AOE spell 
                if (card.events.action) {
                    for (let func of card.events.action) {
                        runFunction(game, func, false, player)
                    }
                }
            }

            endOfAction(gameId)
        }
    }

    emitGameUpdate(game)
}

function spawnMinion(game, card, owner) {
    var minion = clone(MINION)

    minion.id = nanoid()
    minion.name = card.name // Mostly used for logging and debugging
    minion.owner = owner.id // The player of spawned this minion
    minion.hp = card.hp
    minion.maxHp = card.hp;
    minion.damage = card.damage
    minion.isAttacking = false
    minion.hasAttacked = false
    minion.hasBeenAttacked = false;
    minion.spawnRound = game.round;
    minion.origin = card.id // The original card of this minion
    minion.element = card.element
    minion.hasEverAttacked = false;

    if (card.events.onPlayedTarget) {
        if (Object.keys(card.events.onPlayedTarget).length > 0) minion.battlecryActive = true;
    }

    if (card.events.onPlayed) {
        for (let func of card.events.onPlayed) {
            runFunction(game, func, false, owner)
            endOfAction(game.id)
        }
    }

    owner.minions.push(minion)

    addEvent(game, "minion_spawned", {
        id: minion.id
    })
}

function playMinion(gameId, userId, cardIndex) {

    var game = getGame(gameId)

    for (let player of game.players) {
        if (player.id == userId) {
            var card = getCard(player.cards[Number(cardIndex)])

            if (card.type == "minion") {

                // Player has card in their hand
                if (player.manaLeft >= card.mana) {
                    console.log(player.name + " spawned minion " + card.name)
                    spawnMinion(game, card, player)
                    player.manaLeft = Number(player.manaLeft) - Number(card.mana);
                    player.cards.splice(cardIndex, 1)
                    addEvent(game, "card_used", {
                        player: player.id,
                        index: cardIndex,
                        card: card.id
                    })
                }

            }
        }
    }

    emitGameUpdate(game)
}

var unityClients = {}

function attack(gameId, playerId, minionId, targetId) {
    var game = getGame(gameId)
    if (!game) return
    var attacker;
    var target;
    for (let player of game.players) {
        if (player.id == targetId) target = player;

        for (let minion of player.minions) {
            if (minion.id == targetId) target = minion
            if (minion.id == minionId) attacker = minion
        }
    }

    if (!target || !attacker) return

    var player = getCharacter(game, playerId)
    if (!player.turn) return

    var hasTaunt = false;
    for (let player of game.players) {
        if (player.id == target.id || player.id == target.owner) {
            for (let minion of player.minions) {
                if (minion.element == "taunt") hasTaunt = true;
            }
        }
    }

    if (attacker.owner == playerId) {
        if (!hasTaunt || target.element == "taunt") {
            if (!attacker.hasAttacked && (attacker.spawnRound != game.round || attacker.element == "rush")) {

                addEvent(game, "attack", {
                    from: attacker.id,
                    to: target.id
                })

                damage(game, target, attacker.damage)

                if (target.damage) {
                    damage(game, attacker, target.damage)

                }
                attacker.hasAttacked = true;
                attacker.hasEverAttacked = true;
            }
        }
    }

    endOfAction(gameId)
}



function endOfAction(gameId) {
    var game = getGame(gameId)
    if (!game) return
    for (let player of game.players) {
        for (let i = 0; i < player.minions.length; i++) {
            let minion = player.minions[i]
            if (minion.hp <= 0) {
                let card = getCard(minion.origin)

                addEvent(game, "minion_death", {
                    minion: minion.id
                })
                player.minions.splice(i, 1)

                if (card.events.onDeath)
                    for (let func of card.events.onDeath) runFunction(game, func, false, player)
                endOfAction(game.id)
            }
        }
        if (player.hp <= 0) {
            terminateGame(gameId, player.id)
        }
    }

    emitGameUpdate(game)
}

function getDeck(id) {
    var deck = db.get("decks").value()[id]
    if (deck) return deck;
    return false;
}

function matchmake() {

    var player1 = null;
    for (let key in matchmaking) {
        if (!player1) player1 = {
            profile: getUserFromID(matchmaking[key].id),
            socket: matchmaking[key].ws,
            socketid: key,
            deck: matchmaking[key].deck
        }
        else {

            var player2 = {
                profile: getUserFromID(matchmaking[key].id),
                socket: matchmaking[key].ws,
                deck: matchmaking[key].deck
            }

            createNewGame(player1, player2)

            delete matchmaking[key]
            delete matchmaking[player1.key]
        }
    }
}

// Game server
wss.on("connection", (ws, req) => {
    ws.id = req.headers['sec-websocket-key'];
    ws.send(Pack("version", SERVER_VERSION))

    ws.on("close", () => {
        if (matchmaking[ws.id]) {
            delete matchmaking[ws.id]
        }
        if (unityClients[ws.id]) {
            let gameId = getGameIdFromUserId(unityClients[ws.id])
            if (gameId) {
                terminateGame(gameId, unityClients[ws.id]);
            }
            delete onlinePings[unityClients[ws.id]]
        }
    })


    ws.on("message", (message) => {
        var package = JSON.parse(message)
        var userId = null;
        if (package.token) {
            let userToken = db.get("tokens").find({ token: package.token }).value()
            if (userToken) userId = userToken.user
        }

        var gameId = getGameIdFromUserId(userId)

        switch (package.identifier) {
            case "start_matchmaking":
                matchmaking[ws.id] = {
                    ws, id: userId, deck: getDeck(package.packet)
                }
                matchmake();
                console.log("Matchmaking pool size " + Object.keys(matchmaking).length)
                break;
            case "stop_matchmaking":
                if (matchmaking[ws.id]) delete matchmaking[ws.id]
                console.log("Matchmaking pool size " + Object.keys(matchmaking).length)
                break;
            case "ping":
                ws.send(Pack("ping"))
                break;
            case "attack":
                package.packet = JSON.parse(package.packet)
                attack(gameId, userId, package.packet.attacker, package.packet.target)
                break;
            case "play_minion":
                if (gameId) playMinion(gameId, userId, package.packet)
                break;
            case "play_spell":
                if (gameId) playSpell(gameId, userId, package.packet)
                break;
            case "battlecry":
                if (gameId) battlecry(gameId, userId, package.packet)
                break;
            case "sacrifice":
                if (gameId) sacrifice(gameId, userId, package.packet)
                break;
            case "end_turn":
                if (gameId) {
                    var game = getGame(gameId)
                    for (let player of game.players) if (player.id == userId && player.turn) nextTurn(gameId)
                }
                break;
            case "start_test":
                createNewGame({
                    profile: getUserFromToken(package.token),
                    socket: ws,
                    deck: getDeck(package.packet)
                }, false)
                break;
            case "concede":
                terminateGame(gameId, userId)
                break;
            case "login":
                var user = getUserWithPassword(package.packet);
                if (user) {
                    comparePassword(package.token, user.password, (err, match) => {
                        if (match) {
                            var token = createLoginToken(user.id);
                            ws.send(Pack("new_token", token))
                        } else {
                            ws.send(Pack("login_fail"))
                        }
                    })
                }
                break;
            case "login_with_token":
                var existingToken = db.get("tokens").find({ token: package.token }).value()
                if (existingToken) {
                    let user = getUserFromID(existingToken.user)
                    if (unityClients[ws.id]) delete onlinePings[unityClients[ws.id]]
                    unityClients[ws.id] = user.id
                    pingUser(user.id, "game")
                    ws.send(Pack("user", JSON.stringify(userToUnity(user))))
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

                    for (let card of cards.get("cards").value()) {
                        user.cards[card.id] = 10;
                    }

                    db.get("users").push(user).write();
                    var token = createLoginToken(user.id);
                    ws.send(Pack("new_token", token))
                }
                break;


        }

    })

    ws.send(Pack("cards", getUnityCards()))
    /* for (var card of getUnityCards()) {
        ws.send(Pack("cards", JSON.stringify(card)))
    } */
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
    /* return (unityCards) */

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

function userToUnity(user) {
    let userCards = []
    for (let id in user.cards) {
        for (let i = 0; i < user.cards[id]; i++) {
            userCards.push(id)
        }
    }
    user.cards = userCards;
    return user;

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

function shuffle(arr) {
    var len = arr.length;
    var d = len;
    var array = [];
    var k, i;
    for (i = 0; i < d; i++) {
        k = Math.floor(Math.random() * len);
        array.push(arr[k]);
        arr.splice(k, 1);
        len = arr.length;
    }
    for (i = 0; i < d; i++) {
        arr[i] = array[i];
    }
    return arr;
}
