const DEFAULT_CARD = {
    id: 0,
    type: "minion",
    name: "Name",
    description: "Description",
    mana: 0,
    damage: 0,
    hp: 0,
    element: "lunar",
    events: {},
    lastChange: null,
};

var card = null;

var imageUpload = false;
var uploading = false;

var urlID = location.pathname.substr(location.pathname.lastIndexOf("/") + 1);

var inputs = {
    id: document.getElementById("id-input"),
    type: document.getElementById("type-input"),
    name: document.getElementById("name-input"),
    description: document.getElementById("description-input"),
    mana: document.getElementById("mana-input"),
    hp: document.getElementById("hp-input"),
    damage: document.getElementById("damage-input"),
    element: document.getElementById("element-input"),
    rarity: document.getElementById("rarity-input")
};

var cardPreviewEl = document.getElementById("card-preview");
var uploadButton = document.getElementById("upload-button");

uploadButton.onclick = upload;

var uploadingAnimation;
var uploadingAnimationIncrement = 0;

function upload() {
    if (uploading) return;
    if (!imageUpload && !card.lastChange) {
        alert("You need an image for this card!");
        return;
    }
    uploadButton.setAttribute("disabled", "disabled");
    changesDone = false;

    card.lastChange = {
        user: me ? me.username : "Unknown..?",
        date: Date.now(),
    };

    axios.post("/api/card", card).then(() => {
        updateCardFromInput();
    });

    if (imageUpload) {
        uploadButton.innerText = "Uploading...";
        uploading = true;
        uploadButton.style.width = "121px";
        uploadButton.style.textAlign = "left";
        uploadingAnimation = setInterval(() => {
            var text = "Uploading";
            for (var i = 0; i < uploadingAnimationIncrement % 4; i++) {
                text += ".";
            }
            uploadingAnimationIncrement++;
            uploadButton.innerText = text;
        }, 300);
        axios
            .post("/api/upload", {
                image: imageUpload,
                id: card.id,
            })
            .then((res) => {
                clearInterval(uploadingAnimation);
                uploadButton.removeAttribute("style");
                uploading = false;
                imageUpload = false;
                uploadButton.innerHTML = `Upload<svg viewBox="0 0 24 24" class="btn-icon"><g><rect fill="none" height="24" width="24"/></g><g><path d="M18,15v3H6v-3H4v3c0,1.1,0.9,2,2,2h12c1.1,0,2-0.9,2-2v-3H18z M7,9l1.41,1.41L11,7.83V16h2V7.83l2.59,2.58L17,9l-5-5L7,9z"/></g></svg>`;
            });
    }
}

document.getElementById("image-upload-input").onchange = (e) => {
    var input = e.target;

    if (input.files && input.files[0]) {
        var reader = new FileReader();

        reader.onload = function (e) {
            imageUpload = e.target.result;
            document.getElementById("file-upload-preview").src = imageUpload;
            updateCardFromInput();
        };

        reader.readAsDataURL(input.files[0]);
    }
};

function onChange() {
    changesDone++;
    if (changesDone > 2) uploadButton.removeAttribute("disabled");
}

onCardsReady = () => {
    for (let c of cards) {
        if (c.id == urlID) {
            card = c;
        }
    }
    if (!card) {
        card = clone(DEFAULT_CARD);
        card.id = urlID;
    }
    if (card) setPageValuesFromCard(card);
};

var changesDone = 0;

const MINON_EVENTS = ["onPlayedTarget", "onPlayed", "everyRound", "onDeath", "onAttacked"];

const SPELL_EVENTS = ["action"];

function deleteCard() {
    if (confirm("Are you sure you want to permanently delete this card?")) {
        axios
            .post("/api/delete", {
                id: card.id,
            })
            .then((res) => {
                location.href = "/cards";
            });
    }
}

window.onbeforeunload = () => {
    if (changesDone > 2 || uploading) return "";
};

function clone(obj) {
    return Object.assign({}, obj);
}

function setPageValuesFromCard() {
    for (let key in inputs) {
        let input = inputs[key];
        input[input.type != "checkbox" ? "value" : "checked"] = card[key];
    }

    for (input in inputs) {
        inputs[input].oninput = updateCardFromInput;
    }

    updateCardFromInput();
}

function capitilizeFirst(str) {
    return str[0].toUpperCase() + str.substr(1);
}

function loadEvents() {
    var events = card.type == "minion" ? MINON_EVENTS : SPELL_EVENTS;

    for (let event of events) {
        if (card.events[event] == undefined) card.events[event] = [];
    }

    for (let event in card.events) {
        if (events.indexOf(event) == -1) delete card.events[event];
    }

    let eventsEl = document.getElementById("events");
    eventsEl.innerHTML = "";

    const cardFunctions = [
        "damageRandomAnything",
        "changeTargetMaxHp",
        "changeAllyUnitsMaxHp",
        "damageRandomUnit",
        "damageRandomAllyUnit",
        "damageAllUnits",
        "healPlayer",
        "changeTargetAttack",
        "damageTarget",
        "damageTargetUnit",
        "damageOpponent",
        "damageRandomEnemyUnit",
        "damageRandomAlly",
        "damageRandomOpponent",
        "damageEveryOpponent",
        "healTarget",
        "healRandomAlly",
        "healEveryAlly",
        "spawnMinion",
        "gainMana",
        "drawAmountCards",
        "drawCard",
    ].sort();

    let functionsDropDown = "";
    for (let cardFunction of cardFunctions) {
        functionsDropDown += ` <option value="${cardFunction}">${cardFunction}</option>`;
    }

    for (let event in card.events) {
        var functionElements = [];

        for (let i = 0; i < card.events[event].length; i++) {
            let eventFunction = card.events[event][i];
            let eventFunctionElement = createElementFromHTML(`<div class="event-function"> ${eventFunction.func}
            <input class="function-input" type="number" value="${eventFunction.value}"/>
                <svg class="delete-function-button" viewBox="0 0 24 24">
                <path d="M0 0h24v24H0V0z" fill="none"></path>
                <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z"
                ></path>
            </svg>
        </div>`);

            eventFunctionElement.querySelector(
                ".delete-function-button"
            ).onclick = () => {
                card.events[event].splice(i, 1);
                updateCardFromInput();
            };

            eventFunctionElement.querySelector(".function-input").oninput = (
                e
            ) => {
                card.events[event][i].value = e.srcElement.value;
                onChange();

            };

            functionElements.push(eventFunctionElement);
        }

        let eventEl = createElementFromHTML(`<div class="event-window">
        <div class="evenet-title">${event}</div>
        <select class="edit-input add-event-function" name="">
            <option value="">Add function</option>
            ${functionsDropDown}
        </select></div>`);

        // Add in all functions to the event window
        for (let el of functionElements) {
            eventEl.appendChild(el);
        }
        // Implement add function feature
        eventEl.querySelector(".add-event-function").oninput = (e) => {
            card.events[event].push({ func: e.srcElement.value, value: 1 });

            updateCardFromInput();
        };
        eventsEl.appendChild(eventEl);
    }
}

document.getElementById("file-upload-preview").onclick = () => {
    document.getElementById("image-upload-input").click();
};

function updateCardFromInput() {
    for (let key in inputs) {
        let input = inputs[key];
        card[key] = input[input.type != "checkbox" ? "value" : "checked"];
    }

    if (card.lastChange && !imageUpload)
        document.getElementById("file-upload-preview").src =
            "/img/card-images/" + card.id + ".png";

    var element = card.element;
    if (element == "rush" || element == "taunt") element = "neutral"
    document.getElementById(
        "color-indecator"
    ).style.background = `var(--${element})`;

    document.getElementById("color-rarity").style.background = `var(--${card.rarity})`;

    document.getElementById("last-edited").innerText =
        "Last edited: " +
        (card.lastChange
            ? new Date(card.lastChange.date).toISOString().slice(0, 10) +
            " by " +
            card.lastChange.user
            : "Never");

    loadEvents();
    updateCard();
    onChange();
}

function updateCard() {
    cardPreviewEl.innerHTML = "";
    document
        .getElementById("card-preview")
        .appendChild(drawCard(card, imageUpload, true, false));
}
