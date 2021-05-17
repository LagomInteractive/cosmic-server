/**
 * COSMIC server for Outlaws game and website, 2021 Olle Kaiser
 */

// This version is sent to the game clients and if they dont match
// a warning is displayed and the user is told to update their game.
const SERVER_VERSION = "3.1";

// The default deck is the starter deck in the game. It is also
// the deck that our bot uses
// View the full deck here https://outlaws.ygstr.com/deck/zlPbJl-PDN2wR1FzJPFkJ
const DEFAULT_DECK = "zlPbJl-PDN2wR1FzJPFkJ"

// The game port is how the Unity clients connect
// the URL is api.cosmic.ygstr.com
const game_port = 8881;
const website_port = 8882;

// Lowdb, the database https://github.com/typicode/lowdb
// Used for users, cards, decks, tokens, store codes and inventory
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const adapter = new FileSync("db.json");
const db = low(adapter);

const cards = low(new FileSync("cards.json"));
const codes = low(new FileSync("codes.json"));

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

// Express for hosting the website and REST api
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

// Packs is the list of Packs for the store and inventory
// This is the Index and not actual packs owned by users
const PACKS = JSON.parse(fs.readFileSync("packs.json"))

// Tips are displayed on the website at https://outlaws.ygstr.com/wiki
// and also in game in the main menu
const TIPS = JSON.parse(fs.readFileSync("tips.json"))

// Online pings for all users (On the website and in game)
// This allowes us to show who is online right now
// Its currently only showed on the website
var onlinePings = {}

// This is the matchmaking pool. When a user searches for a PVP game
// they get put in this object. Every time a user joins the pool
// they will try to matchmake and create a game. This could be a single
// object: the waiting user, since no more than one person will ever be in this
// object at the same time, but if we want to implement a system that tries to match 
// skill or level this is a good foundation for that. 
var matchmaking = {}

// This is a filter for the Website routes. It makes it so that every request
// will be logged in if a token is provided through cookies.
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
for (let page of ["home", "cards", "wiki", "download", "source", "login"]) {
    app.get(page == "home" ? "/" : "/" + page, (req, res) => {
        res.render(page, {
            page_name: page,
            loggedIn: req.loggedIn,
            user: req.user,
        });
    });
}


// A way to share Olle's todo in real time
app.get("/todo", (req, res) => {
    res.end(fs.readFileSync("TODO.md"));
})

// Generate packs page
app.get("/packs", (req, res) => {
    res.render("packs", {
        loggedIn: req.loggedIn,
        user: req.user,
    });
});

// Edit cards page
app.get("/cards/edit/*", (req, res) => {
    res.render("edit", {
        loggedIn: req.loggedIn,
        user: req.user,
    });
});

// Create new cards link
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

// User pages
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

// Deck editing and viewing page
app.get("/deck/*", (req, res) => {
    res.render("deck", {
        loggedIn: req.loggedIn,
        user: req.user,
    })
})



// REST api for the packs index
app.get("/api/packs", (req, res) => {
    res.json(PACKS)
})

// REST api for generating store codes
// Tool for admins.
app.post("/api/generatePackCodes", (req, res) => {
    if (req.loggedIn && req.user.admin) {
        var response = ""
        for (let i = 0; i < Number(req.body.amount); i++) {
            var code = generateNewCode()

            codes.get("codes").value()[code] = {
                redeemed: false,
                redeemedDate: -1,
                redeemedUser: null,
                size: Number(req.body.size),
                pack: req.body.pack
            }
            codes.write()
            response += code + "<br>"
        }
        res.send(response)
    } else {
        res.send("Permission denied.")
    }
})


function generateNewCode() {
    //Generates a code, like so: 8TBY-B44M-UXXG-U0QC
    var code = []
    var symbols = "abcdefghijklmnopqrstuvwxyz1234567890".toUpperCase();
    for (let i = 0; i < 4; i++) {
        code.push(getFourRandom())
    }

    return code.join("-");

    function getFourRandom() {
        var c = ""
        for (let i = 0; i < 4; i++) {
            c += symbols[Math.floor(Math.random() * symbols.length)]
        }
        return c;
    }
}

// Get a JSON of all cards (REST)
app.get("/api/cards", (req, res) => {
    res.json(cards.get("cards").value());
});

// Get a deck from it's ID (REST)
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
            deleteDeck(deck.id)
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




// Create a new deck (REST)
app.get("/api/newdeck", (req, res) => {
    if (req.loggedIn) {
        var id = createNewDeck(req.user.id)
        res.redirect(`/deck/${id}`)
    } else {
        res.send("You have to be logged in to do this.")
    }
})

// Get all the tips and insert a number for their index
// Helpfull for Unity
function getTips() {
    var tips = TIPS;
    for (let i = 0; i < tips.length; i++) {
        tips[i].number = i + 1;
    }
    return tips;
}



// Get tips in JSON (REST)
app.get("/api/tips", (req, res) => {
    res.json(getTips())
})

// Delete a card from the game (REST, Admin)
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

// Download a backup of the cards
app.get("/backup", (req, res) => {
    res.download(__dirname + "/cards.json");
});

// Upload an image for a card (REST, Admin)
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

// Update a card from the card editor (REST, Admin)
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

// Get all users (Username, Online status, Admin status) REST
app.get("/api/users", (req, res) => {
    var users = db.get("users").value()
    var send = []
    clearPings() // Clear old pings
    for (let user of users) {
        send.push({
            status: onlinePings[user.id] ? onlinePings[user.id].status : "offline",
            username: user.username,
            admin: user.admin
        })
    }
    // Sort users by ping prioriy, basically Gamers highest then Online via Website, last Offline. (All alphabetically)
    send.sort((a, b) => {
        if (PING_PRIORITY.indexOf(a.status) - PING_PRIORITY.indexOf(b.status) != 0) return PING_PRIORITY.indexOf(a.status) - PING_PRIORITY.indexOf(b.status)
        if (a.username > b.username) return 1;
        if (a.username < b.username) return -1
        return 0
    })

    res.json(send)
})

// Get user info REST
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

// Logout via clearing token cookie REST
app.post("/api/logout", (req, res) => {
    res.cookie("cosmic_login_token", { expires: Date.now() });
    res.end();
});

// Login with a token REST
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

// Get a CURL script to download all images from the website.
// This is a quick way for anyone to updated the card images
app.get("/api/assets", (req, res) => {
    var commands = ""
    for (let card of cards.get("cards").value()) {
        commands += `curl https://outlaws.ygstr.com/img/card-images/${card.id}.png --output ${card.id}.png<br>`
    }
    res.send(commands)
})

// All website users ping the server every few seconds to keep their online status
app.post("/api/ping", (req, res) => {
    res.end()
    if (req.loggedIn) pingUser(req.user.id, "website")
})

// The priority of users in the online list, and also if they are logged in on both a game client and the website.
const PING_PRIORITY = ["game", "website", "offline"]

function pingUser(id, status) {
    // Clear all pings that would be considered offline now (3 > seconds old)
    clearPings()
    // Only replace online status if the priority is higher (replace website online if also online in game 
    if (onlinePings[id] && PING_PRIORITY.indexOf(onlinePings[id].status) < PING_PRIORITY.indexOf(status)) return
    onlinePings[id] = {
        // Save the time of when they last pinged
        date: Math.round(Date.now() / 1000),
        status: status
    }
}

// Clear all pings that would be considered offline now ( > 3 seconds old)
function clearPings() {
    for (let key in onlinePings) {
        if (onlinePings[key].status != "game" && (Date.now() / 1000) - onlinePings[key].date > 3)
            // Not pinged for more than 3 seconds
            delete onlinePings[key];
    }
}

// Delete a user from the Game and Website (REST, Admin)
app.post("/api/deleteUser", (req, res) => {
    if (req.loggedIn && req.user.admin) {
        var user = getUserWithPassword(req.user.username)
        comparePassword(req.body.password, user.password, (err, match) => {
            if (match) {
                var deleteUser = getUser(req.body.username)
                if (deleteUser) {
                    // Delete all the users tokens
                    while (db.get("tokens").find({ user: deleteUser.id }).value()) {
                        for (let i = 0; i < db.get("tokens").value().length; i++) {
                            if (db.get("tokens").value()[i].user == deleteUser.id) {
                                db.get("tokens").value().splice(i, 1)
                                db.write()
                            }
                        }
                    }

                    // Delete the user
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

// Toggle a users admin status (REST, Admin)
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

// Login with a password / Create a new account
app.post("/api/loginPass", (req, res) => {
    var user = getUserWithPassword(req.body.username);
    if (user) {
        // User exists, try to log them in
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
                // The inventory
                cards: {},
                packs: {
                    // Give the user the starter packs (1x of each element, 3x All packs)
                    "UCFK8h7yKvxJWSnhoTJnJ": 3,
                    "TSOT6j7yKvxJWSnhoOJmJ": 1,
                    "YhMqJSlgskG7JdpKWtTTq": 1,
                    "2KIvfjJ85Je65AgpbLUTi": 1,
                    "PpbpmK-I5sAROPP_eLrH5": 1
                },
                admin: false,
                record: {
                    wins: 0,
                    losses: 0,
                },
                // If this is false, the user will get a greeting message first time logging in on the game
                // This is not saved locally in the game because the user may switch platform and may create new
                // users on the same platform, so this we found was the best solution
                hasLoggedInViaGameClient: false,
                joined: Date.now()
            };

            console.log("Created new user " + user.username)

            db.get("users").push(user).write();
            var token = createLoginToken(user.id);
            callback({ success: true, token });
        });
    }
}

// This filters usernames that try to sign up
// If the filter catches a name, it will be saved so we
// can see if the block was justified. We did not make the list
// so we may want to modify it.
function filterUsername(username) {
    username = username.toLowerCase();
    for (var bad_word of profanity_filter) {
        if (username.indexOf(bad_word) != -1) {
            // Save the filtered username to the database
            db.get("filtered_usernames")
                .push({ username, bad_word, date: Date.now() })
                .write();
            return bad_word;
        }
    }
    return true;
}

// Creates a token that is used to login on both the game and the website.
function createLoginToken(userID) {
    var token = nanoid();
    db.get("tokens").push({ token, user: userID, created: Date.now() }).write();
    return token;
}

// Current active games right now
var games = []

// List of timeouts indexed by game id, so the game will auto turn after 60 seconds.
var roundCountdowns = {}

// Template for an active Game
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

// Template for a playing player in a game (includes Bot)
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
    passive: 0,
    outlaw: null,
    isAttacking: false,
    hasAttacked: false,
    hasBeenAttacked: false,
    manaLeft: 0,
    totalMana: 0,
    isBot: false,
    profile: null,
    turn: false,
}

// Template for an active Unit
const MINION = {
    id: nanoid(),
    hp: 0,
    isAttacking: false,
    hasAttacked: false,
    hasBeenAttacked: false,
    buff: null,
    origin: null,
    spawnRound: 0,
    owner: null,
    battlecryActive: false
}

// Enum of outlaws
const OUTLAWS = {
    necromancer: "necromancer",
    mercenary: "mercenary"
}

/**
 * Create a new online or bot game
 * @param {*} user1 The first user to be added, they will start the round
 * @param {*} user2 The seconds player, or if left empty a bot.
 */
function createNewGame(user1, user2 = false) {

    // Create a new game from the template and give it a new ID
    var game = clone(GAME)
    game.id = nanoid()

    var player1 = createPlayer(user1)
    var player2 = user2 ? createPlayer(user2) : createBot();

    // On the first turn this will be flipped, so it's actually player 1
    // that starts the game.
    player2.turn = true;

    game.players = [player1, player2]
    game.gameStarted = Date.now()

    // Update stats used for analytics
    db.get("stats").value().played_games++
    db.write();

    // Shuffle player decks
    for (let player of game.players) {
        player.deck = shuffle(player.deck)
    }

    // Add the game to the active games list and start the game.
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
    var loser;
    for (let player of game.players) {
        if (player.id != loserId) winner = player
        else loser = player;
    }

    winner.xp += 500;


    // Calculate xp level up for the two players
    for (let player of game.players) {
        if (!player.isBot) {

            // XP requerements for the first 5 levels and on
            // More info about the XP system here: 
            // https://github.com/LagomInteractive/cosmic-server/blob/master/TODO.md#xp-system
            var levels = [100, 250, 500, 750, 1000]
            var user = getDatabaseUser(player.id)

            // Add win/loss stats
            if (player.id == winner.id) user.record.wins++;
            else user.record.losses++


            // Transfer match XP gained to the user
            var xpFrom = user.xp;
            var xpRange;
            var xpGained = player.xp
            user.xp += player.xp;

            var canLevelUp = true;

            while (canLevelUp) {
                var xpGoal = levels[user.level - 1] ? levels[user.level - 1] : levels[levels.length - 1]
                xpRange = xpGoal;
                if (xpGoal < user.xp) {
                    user.xp -= xpGoal;
                    user.level++;

                    // Reward the user with one All pack for leveling up.
                    if (!user.packs["UCFK8h7yKvxJWSnhoTJnJ"]) user.packs["UCFK8h7yKvxJWSnhoTJnJ"] = 1
                    else user.packs["UCFK8h7yKvxJWSnhoTJnJ"]++

                    console.log(user.username + " leveled up to Level " + user.level + "!")
                } else {
                    canLevelUp = false;
                }
            }

            // If xpFrom is lower than xpTo the user has leveled up at least once, so
            // show it coming from xp = 0 to visualize correctly
            var xpTo = user.xp;
            if (xpTo < xpFrom) xpFrom = 0;
            db.write();

            sendUnityProfileUpdate(player.id, player.socket)

            player.socket.send(Pack("xp_update", JSON.stringify({
                xpFrom, xpTo, xpRange, level: user.level, xpGained
            })))
        }
    }

    addEvent(game, "game_over", { winner: winner.id })
    emitGameUpdate(game)

    for (let i = 0; i < games.length; i++) {
        if (games[i].id == id) {
            games.splice(i, 1)
            break;
        }
    }

    //console.log("Terminating game " + id + " total active games: " + games.length)
    console.log(`Ending game
(Won) ${winner.name} vs. ${loser.name}
Total rounds: ${game.round}, total time ${Math.floor((Date.now() - game.gameStarted) / 1000 / 60)}m`)
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

    console.log("Starting game with " + game.players[0].name + " and " + game.players[1].name + ", total active games: " + games.length)
    emitGameUpdate(game)

    nextTurn(id)
}

function isElemental(element) {
    return ELEMENTS.indexOf(element) != -1;
}

function runBot(gameid) {
    var game = getGame(gameid);
    for (var player of game.players) {
        if (player.turn && player.isBot) {

            // Check if bot can play any cards
            var affordableCards = []
            for (var i = 0; i < player.cards.length; i++) {
                var card = getCard(player.cards[i]);
                if (card.mana <= player.manaLeft) {
                    affordableCards.push(card.id)
                }
            }

            if (affordableCards.length > 0) {
                var cardId = affordableCards[Math.floor(Math.random() * affordableCards.length)];
                var card = getCard(cardId)
                if (card.type == "minion") {
                    if (player.minions.length < 7) {
                        playMinion(game.id, player.id, cardId);
                        return;
                    }
                } else if (card.type == "aoeSpell") {
                    // Do not play the Mercenary Passive card if the hand is full (Will loop)
                    if (card.id != 177 || player.cards.length < 8) {
                        playSpell(game.id, player.id, { id: cardId })
                        return
                    }
                } else if (card.type == "targetSpell") {
                    var opponent = getOpponent(game, player.id)
                    var target = opponent;
                    if (opponent.minions.length > 0) target = opponent.minions[Math.floor(Math.random() * opponent.minions.length)]

                    playSpell(game.id, player.id, { id: cardId, target: target.id })
                    return
                }
            }

            var attacker;
            var target;
            for (let minion of player.minions) {
                if (!minion.hasAttacked && minion.spawnRound != game.round) {
                    var origin = getCard(minion.origin)
                    var willSacrifice = false;
                    if (origin.hp > minion.hp) willSacrifice = Math.random() < .7;
                    else if (origin.hp == minion.hp) willSacrifice = Math.random() < .3;
                    else if (origin.hp < minion.hp) willSacrifice = false;

                    if (player.buff.sacrifices > 0 && player.buff.element != origin.element) willSacrifice = false;
                    if (player.buff.sacrifices >= 3) willSacrifice = false;

                    if (willSacrifice && isElemental(origin.element)) {
                        sacrifice(game.id, player.id, minion.id)
                    } else {
                        attacker = minion
                    }
                } else if (minion.element == "rush" && !minion.hasAttacked) {
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

                        var targets = []

                        for (let minion of opponent.minions) {
                            if (!opponentHasTaunt || minion.element == "taunt") {
                                targets.push(minion)
                                break;
                            }
                        }

                        if (!opponentHasTaunt) targets.push(opponent)

                        attack(game.id, player.id, attacker.id, targets[Math.floor(Math.random() * targets.length)].id)
                        return
                    }
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
        player.xp += 5;
        player.turn = !player.turn
        if (player.turn) {
            // If the player passive is 5, increasePassive will not add any passives but only check if they can give the player the passive reward.
            // Otherwise it will try again next turn.
            if (player.outlaw == OUTLAWS.mercenary || player.passive == 5) increasePassive(game, player)

            if (player.isBot) attackingPlayerIsBot = true;
            attackingPlayer = player.id;
            // Give the attacking player a new card at the start of the round
            if (game.turn != 1) dealCards(id, player.id)
            player.totalMana = game.round > 9 ? 9 : game.round
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
                    if (dealCard(game, player, card))
                        player.deck.splice(0, 1)
                    // Delete the card from the players deck
                } else {
                    // Player has run out of cards
                    // we might do something here
                }
            }
        }
    }

}

function dealCard(game, player, cardId) {
    if (player.cards.length < 8) {
        player.cards.push(cardId)
        addEvent(game, "player_deal_card", {
            player: player.id,
            card: cardId
        })
        addStat(db.get("stats").value().card_draws, cardId);
        return true
    }
    return false;
}

function addEvent(game, identifier, values = {}) {
    game.events.push({
        identifier,
        values
    })
}

// Emit the entire game info to all players in the game
function emitGameUpdate(g) {

    g.roundTimeLeft = ((g.roundLength * 1000) - (Date.now() - g.roundStarted)) / 1000
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

function getRandomOutlaw() {
    return Object.keys(OUTLAWS)[Math.floor(Math.random() * Object.keys(OUTLAWS).length)]
}

function createBot(deck) {
    var bot = clone(PLAYER)
    // Player 1 will be attacking first.
    // When the round start, the attacking player is flipped
    bot.isBot = true;
    bot.xp = 0;
    bot.name = "Bot"
    bot.id = nanoid()
    bot.outlaw = getRandomOutlaw();
    addDeck(bot, deck)
    return bot;
}

function addDeck(player, deck) {

    // If deck is missing
    if (!deck) deck = db.get("decks").find({ id: DEFAULT_DECK }).value()

    for (let key in deck.cards) {
        for (let i = 0; i < Number(deck.cards[key]); i++) {
            player.deck.push(Number(key));
        }
    }
}


function createNewDeck(owner) {
    let id = nanoid()
    db.get("decks").value()[id] = {
        title: "Untitled deck",
        cards: {},
        owner: owner,
        id
    }
    db.write()
    return id;
}

function deleteDeck(id) {
    delete db.get("decks").value()[id]
    db.write()
}


function createPlayer(user) {

    var player = clone(PLAYER)

    addDeck(player, user.deck)
    player.name = user.profile.username
    player.id = user.profile.id
    player.profile = user.profile
    player.outlaw = user.outlaw;
    player.isBot = false;
    player.xp = 0;

    /*  let playerCards = []
     for (let key in player.profile.cards) {
         for (let i = 0; i < Number(player.profile.cards[key]); i++) {
             playerCards.push(Number(key));
         }
     }
 
     player.profile.cards = playerCards; */

    player.socket = user.socket
    return player
}

function getCard(cardId) {
    return cards.get("cards").find({ id: String(cardId) }).value()
}

function openPack(userId, packId) {
    var user = getDatabaseUser(userId)
    var pack = getPack(packId)
    if (user.packs[pack.id]) {
        if (user.packs[pack.id] > 0) {

            user.packs[pack.id]--;

            let drop = []
            if (pack.id == '7LjVkr2TS0baaZkJ_xmAy') {
                drop = pack.cards
            } else {

                for (let i = 0; i < 5; i++) {

                    var rarities = ["common", "uncommon", "rare", "epic", "celestial", "developer"]
                    var sortedPackByRarity = []


                    for (let cardId of pack.cards) {
                        var rarityIndex = rarities.indexOf(getCard(cardId).rarity)
                        if (!sortedPackByRarity[rarityIndex]) sortedPackByRarity[rarityIndex] = []
                        sortedPackByRarity[rarityIndex].push(cardId);
                    }

                    var rarityIndexDrawn = 0;
                    var rand = Math.random();
                    if (.35 < rand) rarityIndexDrawn = 1
                    if (.6 < rand) rarityIndexDrawn = 2
                    if (.8 < rand) rarityIndexDrawn = 3
                    if (.95 < rand) rarityIndexDrawn = 4

                    var eligableCards = sortedPackByRarity[rarityIndexDrawn]

                    // This is just to make sure if there is not card of this rarity it will choose a lower rarity
                    // There will always be cards of Common (the lowest) rarity in all packs (except for
                    // the dev pack, but that one is handled differently from all other packs)
                    while (!eligableCards) eligableCards = sortedPackByRarity[--rarityIndexDrawn];

                    var drawnCard = eligableCards[Math.floor(Math.random() * eligableCards.length)]
                    drop.push(drawnCard)
                }
            }

            for (let id of drop) {
                if (user.cards[id]) user.cards[id]++
                else user.cards[id] = 1;
            }
            db.write();
            return drop;
        }
    }
    return [];
}



function increasePassive(game, player) {
    player.passive++;
    if (player.passive == 5) {
        player.xp += 25;
    }
    if (player.passive > 5) player.passive = 5;

    if (player.passive >= 5) {
        if (player.cards.length < 8) {
            player.passive = 0;
            if (player.outlaw == OUTLAWS.necromancer) {
                dealCard(game, player, 176)
            }
            if (player.outlaw == OUTLAWS.mercenary) {
                dealCard(game, player, 177)
            }
        }

    }
}

const ELEMENTS = ["lunar", "solar", "zenith", "nova"]

function sacrifice(gameId, userId, minionId) {
    var game = getGame(gameId)
    if (!game) return
    var player = getCharacter(game, userId)
    var minion = getCharacter(game, minionId)


    if (player.turn &&
        !minion.hasAttacked &&
        // Only an elemental minion can be sacrificed
        ELEMENTS.indexOf(minion.element) != -1) {
        addEvent(game, "minion_sacrificed", {
            id: minion.id
        })

        addStat(db.get("stats").value().sacrifices, minion.origin);

        if (player.outlaw == OUTLAWS.necromancer) {
            increasePassive(game, player)
        }

        // Delete the minion from the player.
        for (let i = 0; i < player.minions.length; i++) {
            if (player.minions[i].id == minionId) player.minions.splice(i, 1);
        }

        if (player.buff.element == minion.element) {
            player.buff.sacrifices++;
            if (player.buff.sacrifice == 3) {
                player.xp += 100
            }
            if (player.buff.sacrifices > 3) player.buff.sacrifices = 3;
        } else player.buff = {
            element: minion.element,
            sacrifices: 1
        }
    }

    endOfAction(game.id)
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
    //console.log("Function run: " + func.func + " , val: " + func.value)
    func.value = Number(func.value)
    switch (func.func) {
        case "changeTargetAttack":
            if (target && target.origin) {
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
            if (target && target.origin) {
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
        if (card.events.onAttacked && damage > 0) for (let func of card.events.onAttacked) runFunction(game, func, target, owner)
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

    if (typeof info == "string") info = JSON.parse(info)
    var game = getGame(gameId)
    if (!game) return
    for (let player of game.players) {
        if (player.id == userId) {
            var card = getCard(info.id)
            if (!card || card.mana > player.manaLeft) break
            if (!player.turn) break;
            if (player.cards.indexOf(Number(info.id)) == -1) break;

            player.manaLeft -= card.mana;
            player.cards.splice(player.cards.indexOf(Number(info.id)), 1);


            addEvent(game, "card_used", {
                player: player.id,
                card: card.id
            })

            addStat(db.get("stats").value().card_playes, card.id);

            if (card.type == "targetSpell") {
                if (card.events.action) {
                    var target = getCharacter(game, info.target)
                    for (let func of card.events.action) {
                        runFunction(game, func, target, player)
                    }
                }
            } else {
                // AOE spell 
                if (card.id == 177) {
                    var opponent = getOpponent(game, player.id)
                    if (opponent.cards.length > 0) {
                        var randomCard = opponent.cards[Math.floor(Math.random() * opponent.cards.length)]
                        dealCard(game, player, randomCard)
                    }
                }
                if (card.events.action) {
                    for (let func of card.events.action) {
                        runFunction(game, func, player, player)
                    }
                }
            }

            endOfAction(gameId)
        }
    }

    emitGameUpdate(game)
}

function spawnMinion(game, card, owner) {
    if (owner.minions.length >= 7) return
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

    minion.riposte = card.events.onAttacked && card.events.onAttacked.length > 0;
    minion.deathrattle = card.events.onDeath && card.events.onDeath.length > 0;

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

function playMinion(gameId, userId, cardId) {

    var game = getGame(gameId)

    for (let player of game.players) {
        if (player.id == userId) {
            var card = getCard(cardId)

            if (card.type == "minion" && player.cards.indexOf(Number(card.id)) != -1) {

                // Player has card in their hand
                if (player.manaLeft >= card.mana && player.minions.length < 7) {

                    addEvent(game, "card_used", {
                        player: player.id,
                        card: card.id
                    })

                    addStat(db.get("stats").value().card_playes, card.id);

                    spawnMinion(game, card, player)
                    player.manaLeft = Number(player.manaLeft) - Number(card.mana);
                    player.cards.splice(player.cards.indexOf(Number(card.id)), 1)

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

                var opponent = getOpponent(game, player.id)
                if (opponent.outlaw == OUTLAWS.necromancer) {
                    increasePassive(game, opponent)
                }


                // Kill a unit XP Reward
                opponent.xp += 30


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
            outlaw: matchmaking[key].outlaw,
            deck: getDeck(matchmaking[key].deck),
            key
        }
        else {
            if (player1.id != matchmaking[key].id) {
                var player2 = {
                    profile: getUserFromID(matchmaking[key].id),
                    socket: matchmaking[key].ws,
                    outlaw: matchmaking[key].outlaw,
                    deck: getDeck(matchmaking[key].deck)
                }

                delete matchmaking[key]
                delete matchmaking[player1.key]

                createNewGame(player1, player2)
            }
        }
    }
}

function modifyCardInDeck(info, userId) {
    var info = JSON.parse(info)
    var deck = getDeck(info.deck)
    var add = info.add == "True"

    var user = getUserFromID(userId)
    if (deck && deck.owner == user.id) {
        var amountInInventory = user.cards[info.card]
        var amountInDeck = deck.cards[info.card]

        if (!amountInDeck) amountInDeck = 0;
        if (!amountInInventory) amountInInventory = 0;

        // Try to add or increase the card in the deck

        if (add) {
            if (amountInDeck < 2) {
                if (amountInInventory - amountInDeck > 0) {
                    // Can be added to deck
                    if (deck.cards[info.card]) deck.cards[info.card]++;
                    else deck.cards[info.card] = 1;
                }
            }
        } else {
            // Try to remove one of these cards from the deck
            if (amountInDeck > 0) {
                deck.cards[info.card]--;
                if (deck.cards[info.card] == 0) delete deck.cards[info.card]
            }
        }

        db.write();
    }
}

function getPack(id) {
    for (let name in PACKS) {
        var pack = PACKS[name]
        pack.name = name;
        if (pack.id == id) return pack;
    }
}

function getPacks() {
    var packs = []
    for (let name in PACKS) {
        var pack = PACKS[name]
        pack.name = name;
        packs.push(pack)
    }
    return packs;
}

function getDatabaseUser(userId) {
    for (let user of db.get("users").value()) {
        if (user.id == userId) return user;
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
            case "open_pack":
                var drop = openPack(userId, package.packet);
                if (drop.length > 0) ws.send(Pack("pack_opened", JSON.stringify(drop)))
                sendUnityProfileUpdate(userId, ws)
                break;
            case "redeem_code":
                if (userId) {
                    var user = getUserFromID(userId)
                    var code = codes.get("codes").value()[package.packet]
                    if (code) {
                        if (!code.redeemed) {
                            // Redeem code
                            code.redeemed = true;
                            code.redeemedDate = Date.now()
                            code.redeemedUser = user.username;
                            var pack = getPack(code.pack)

                            var dbUser = getDatabaseUser(user.id)
                            if (dbUser.packs[pack.id]) dbUser.packs[pack.id] += code.size
                            else dbUser.packs[pack.id] = code.size;

                            codes.write()
                            db.write()

                            console.log(user.username + " redeemed " + pack.name + " x" + code.size)

                            ws.send(Pack("code_redeemed", JSON.stringify(
                                {
                                    success: true,
                                    message: `Redeemed ${code.size}x ${pack.name}!`
                                }
                            )))
                            sendUnityProfileUpdate(user.id, ws)
                        } else {
                            ws.send(Pack("code_redeemed", JSON.stringify(
                                {
                                    success: false,
                                    message: "This code has already been redeemed by " + code.redeemedUser + "."
                                }
                            )))
                        }
                    } else {
                        ws.send(Pack("code_redeemed", JSON.stringify(
                            {
                                success: false,
                                message: "This code does not exist."
                            }
                        )))
                    }
                }
                break;
            case "cancel_search":
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
            case "search_game":
                var searchOptions = JSON.parse(package.packet)

                if (searchOptions.gameType == "Pvp") {
                    matchmaking[ws.id] = {
                        ws, id: userId, deck: searchOptions.deck, outlaw: searchOptions.outlaw
                    }
                    matchmake();
                    console.log("Matchmaking pool size " + Object.keys(matchmaking).length)
                } else {
                    // Campaign search
                    createNewGame({
                        profile: getUserFromToken(package.token),
                        socket: ws,
                        deck: getDeck(searchOptions.deck),
                        outlaw: searchOptions.outlaw
                    }, false)
                }
                break;
            case "new_deck":
                if (!userId) return;
                var id = createNewDeck(userId);
                sendUnityProfileUpdate(userId, ws)
                break;
            case "delete_deck":
                if (!userId) return;
                var deck = getDeck(package.packet)
                if (deck && deck.owner == userId) {
                    deleteDeck(deck.id)
                }
                sendUnityProfileUpdate(userId, ws)
                break;
            case "rename_deck":
                var info = JSON.parse(package.packet)
                var deck = getDeck(info.deck)
                if (deck.owner == userId) {
                    if (info.name.length > 0) {
                        deck.title = info.name
                        db.write()
                    }
                }
                break;
            case "modify_card_in_deck":
                modifyCardInDeck(package.packet, userId)
                sendUnityProfileUpdate(userId, ws)
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
                            ws.send(Pack("login_fail", "Wrong password for " + user.username))
                        }
                    })
                } else {
                    createUser(package.packet, package.token, res => {
                        if (res.success) {
                            ws.send(Pack("new_token", res.token))
                        } else {
                            ws.send(Pack("login_fail", res.reason))
                        }
                    })
                }
                break;
            case "login_with_token":
                var existingToken = db.get("tokens").find({ token: package.token }).value()
                if (existingToken) {
                    if (onlinePings[unityClients[ws.id]]) delete onlinePings[unityClients[ws.id]]
                    unityClients[ws.id] = existingToken.user

                    pingUser(existingToken.user, "game")
                    sendUnityProfileUpdate(existingToken.user, ws);
                    getDatabaseUser(existingToken.user).hasLoggedInViaGameClient = true;
                    db.write()
                } else {
                    ws.send(Pack("user_not_found"))
                }
                break;
        }

    })

    // Send all users that connect the tips, all card packs (what they contain and their names)
    // and the database of all cards
    ws.send(Pack("tips", JSON.stringify(getTips())))
    ws.send(Pack("packs", JSON.stringify(getPacks())))
    ws.send(Pack("cards", getUnityCards()))
});

function sendUnityProfileUpdate(userId, socket) {
    let user = getUnityUser(userId)
    socket.send(Pack("user", JSON.stringify(user)))
}

function getUnityUser(id) {
    let user = getUserFromID(id)
    user.decks = []

    for (let key in db.get("decks").value()) {
        var deck = db.get("decks").value()[key]
        if (deck.owner == user.id) {
            user.decks.push(deck)
        }
    }

    return user;
}


/* Gets all cards but in the format for Unity
   Removes events and unnecessary card info
   Converts the Bold and Italics styles to Unity rich text */
function getUnityCards() {
    var unityCards = clone(cards.get("cards").value())

    function sortCards(a, b) {
        var order = ["rush", "taunt", "lunar", "nova", "solar", "zenith"]
        var val = (order.indexOf(a.element) - order.indexOf(b.element))
        if (val != 0) return val
        return (a).mana - (b).mana
    }

    unityCards.sort(sortCards);

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

codes.defaults({ codes: {} }).write()

db.defaults({
    users: [],
    games: [],
    tokens: [],
    decks: {},
    stats: {
        played_games: 0,
        card_playes: {},
        card_draws: {},
        sacrifices: {},
    },
    filtered_usernames: [],
}).write();

function addStat(stat, card) {
    if (stat[card]) stat[card]++;
    else stat[card] = 1;
    db.write();
}

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
    var user = db.get("users").find({ id }).value()
    if (!user) return null;
    var userWithoutPass = clone(user);

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
