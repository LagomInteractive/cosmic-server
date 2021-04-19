
/* var deck = {
    owner_username: "Olle",
    owner: "zMTPdFrEzJTFDuKwxcUMW",
    title: "Untitled deck",
    cards: {}
} */

var deck_id = location.href.substr(location.href.lastIndexOf("/") + 1)

var deck;
var isDeckOwner
var entriesEl = document.getElementById("deck-entries")
var entries = {}
var maxDeckSize = 20;

var everythingLoaded = false;

function loadStep(str) {

    if (everythingLoaded || !token) {
        axios.get("/api/deck?id=" + deck_id).then(res => {
            deck = res.data
            loadDeck()
          
        })
    }
    everythingLoaded = true;
}

onCardsReady = loadStep;
onLogin = loadStep;

function loadDeck() {
    isDeckOwner = deck.owner == me.id
    var cardEntries = Object.keys(isDeckOwner ? me.cards : deck.cards)

    document.getElementById("deck-username").innerText = deck.owner_username
    document.getElementById("deck-title").value = deck.title
    document.getElementById("deck-title").oninput = (e) => {
        var title = e.target.value
        if (title.trim().length > 0) deck.title = title
        uploadChanges()
    }

    for (let id of cardEntries) {
        let card = getCard(id)
        var cardEntry = createElementFromHTML(`<div class="deck-slot"><img class="deck-slot-image" src="/img/card-images/${id}.png" alt="">
        <div class="cover-image-gradient"></div>
        <div class="card-mana-cost">${card.mana}</div>
        <div class="card-name">${card.name}</div>
        <div class="card-element" style="color:var(--${card.element});">${card.element[0].toUpperCase() + card.element.substr(1)}</div>
        <div class="amount">
            ${isDeckOwner ? `<button id="minus" class="material-icons icon-btn">remove</button>
            <button id="plus" class="material-icons icon-btn" style="float:right;">add</button>` : ""}
            <div class="amount-number">-</div>
        </div>
        </div>`)

        if(isDeckOwner){
            cardEntry.querySelector("#plus").onclick = () => {
                if(me.cards[id] <= deck.cards[id]) return
                if (getTotalCards() < maxDeckSize) {
                    if (!deck.cards[id]) deck.cards[id] = 0
                    if (deck.cards[id] < 2) deck.cards[id]++;
                }
                setDeckValues()
                uploadChanges()
            }
            cardEntry.querySelector("#minus").onclick = () => {
                if (deck.cards[id] > 0) deck.cards[id]--;
                setDeckValues()
                uploadChanges()
            }

            document.getElementById("delete-deck").style.display = "block"
        } else {
            document.getElementById("deck-title").setAttribute("disabled", "disabled")
        }

        entries[id] = cardEntry
        entriesEl.appendChild(cardEntry)
    }

    setDeckValues()
}

function deleteDeck(){
    axios.post("/api/deleteDeck", {
        id: deck.id
    }).then(() => {
        location.href = "/user/" + me.username
    })
}

function setDeckValues() {
    for (let id in entries) {
        var entry = entries[id]
        var amount = deck.cards[id] ? deck.cards[id] : 0
        entry.querySelector(".amount-number").innerText = amount;
        // Add the green right border if the slot is active
        if (isDeckOwner) entry.classList[amount > 0 ? "add" : "remove"]("slot-active")
    }

    document.getElementById("amount-of-cards").innerText = getTotalCards() + "/" + maxDeckSize + " "
}

function uploadChanges() {
    axios.post("/api/deck", {
        deck
    })
}

function getTotalCards() {
    var totalCards = 0
    for (let card in deck.cards) {
        totalCards += deck.cards[card]
    }
    return totalCards
}