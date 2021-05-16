var invenotry = document.getElementById("inventory");
var username = document.getElementById("profile-username").innerText;

function toggleAdmin(username) {
    axios.post("/api/admin", {
        username
    }).then(res => {
        location.reload()
    })
}

function deleteUser(username) {
    var password = prompt("Enter your password to PERMANENTLY delete this user.")
    axios.post("/api/deleteUser", { username, password }).then(res => {
        location.reload();
    })
}

onCardsReady = () => {
    getUser(username, (user) => {
        //user.cards.sort();
        var cardIDs = Object.keys(user.cards)
        cardIDs.sort()

        for (let deck of user.decks) {
            document.getElementById("decks").innerHTML +=
                `<a href="/deck/${deck.id}" class="deck-link">${deck.title}</a>`
        }

        /* for (let card of cardIDs) {
            for (let i = 0; i < user.cards[card]; i++) {
                var canvas = drawCard(getCard(card), false, false);
                canvas.classList.add("inventory-card");
                invenotry.appendChild(canvas);
            }
        } */
    });
};
