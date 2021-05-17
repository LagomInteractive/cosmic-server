
var users;
var sortMode = "sort-wins"
var sortButtons = ["sort-wins", "sort-level"]

for (let name of sortButtons) {
    let button = document.getElementById(name)
    button.addEventListener("click", e => {
        sortMode = name;

        button.classList.add("leaderboard-selected")

        var otherButton = sortButtons[0] == name ? sortButtons[1] : sortButtons[0]
        document.getElementById(otherButton).classList.remove("leaderboard-selected")
        loadLeaderboard()
    })
}

function loadLeaderboard() {
    console.log(sortMode)
    if (sortMode == "sort-wins") {
        users.sort((a, b) => {
            return b.wins - a.wins
        })
    } else {
        users.sort((a, b) => {
            return b.level - a.level
        })
    }

    var html = ""
    for (let i = 0; i < users.length; i++) {
        var user = users[i]
        html += `<a href="/user/${user.username}">
        <div class="leaderboard-user ${i == 0 ? "golden" : ""}"><div class="leaderboard-username">${user.username}</div>
        <div class="leaderboard-wins">${user.wins} Wins</div>
        <div class="leaderboard-level">${user.level} Lvl</div></div></a>`

    }

    document.getElementById("leaderboard").innerHTML = html;
}

axios.get("/api/leaderboard").then(res => {
    users = res.data;
    loadLeaderboard()
})