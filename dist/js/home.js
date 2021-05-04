
var usersEl = document.getElementById("users-list")

updateUsersList()
setInterval(updateUsersList, 4000)


function updateUsersList() {

    axios.get("/api/users").then(res => {
        var html = '<div>'
        for (let user of res.data) {
            html += `<a class="user-list-entry" href="/user/${user.username}">
            ${user.status != "game" ? `<div title="${user.status == "website" ? "Online" : "Offline"}" class="online-status" style="background:${user.status == "website" ? "var(--green)" : "var(--header)"};"></div>` : `<svg title="Online in game" class="in-game-icon" enable-background="new 0 0 24 24" viewBox="0 0 24 24" fill="#000000"><g><rect fill="none" height="24" width="24"/></g><g><g><path d="M21.58,16.09l-1.09-7.66C20.21,6.46,18.52,5,16.53,5H7.47C5.48,5,3.79,6.46,3.51,8.43l-1.09,7.66 C2.2,17.63,3.39,19,4.94,19h0c0.68,0,1.32-0.27,1.8-0.75L9,16h6l2.25,2.25c0.48,0.48,1.13,0.75,1.8,0.75h0 C20.61,19,21.8,17.63,21.58,16.09z M11,11H9v2H8v-2H6v-1h2V8h1v2h2V11z M15,10c-0.55,0-1-0.45-1-1c0-0.55,0.45-1,1-1s1,0.45,1,1 C16,9.55,15.55,10,15,10z M17,13c-0.55,0-1-0.45-1-1c0-0.55,0.45-1,1-1s1,0.45,1,1C18,12.55,17.55,13,17,13z"/></g></g></svg>`}
            ${user.admin ? `<svg title="Developer" class="user-list-admin" enable-background="new 0 0 24 24" viewBox="0 0 24 24" fill="white"><g><rect fill="none" height="24" width="24"/><rect fill="none" height="24" width="24"/></g><g><g><path d="M20.99,17.99l-4.94-4.94l-2.12,2.12l4.94,4.94c0.59,0.59,1.54,0.59,2.12,0C21.57,19.52,21.57,18.57,20.99,17.99z"/><path d="M17.65,10c1.93,0,3.5-1.57,3.5-3.5c0-0.58-0.16-1.12-0.41-1.6l-2.7,2.7l-1.49-1.49l2.7-2.7C18.77,3.16,18.23,3,17.65,3 c-1.93,0-3.5,1.57-3.5,3.5c0,0.41,0.08,0.8,0.21,1.16l-1.85,1.85l-1.78-1.78l0,0c0.39-0.39,0.39-1.02,0-1.41l-0.71-0.71l2.12-2.12 c-1.17-1.17-3.07-1.17-4.24,0L5.08,6.32c-0.39,0.39-0.39,1.02,0,1.41l0.71,0.71H3.25c-0.19,0-0.37,0.07-0.5,0.21 c-0.28,0.28-0.28,0.72,0,1l2.54,2.54c0.28,0.28,0.72,0.28,1,0c0.13-0.13,0.21-0.31,0.21-0.5V9.15L7.2,9.85 c0.39,0.39,1.02,0.39,1.41,0l1.78,1.78l-6.35,6.35c-0.59,0.59-0.59,1.54,0,2.12v0c0.59,0.59,1.54,0.59,2.12,0L16.48,9.79 C16.85,9.92,17.24,10,17.65,10z"/></g></g></svg>` : ''}
            <div class="user-list-username" style="${user.admin ? "left:65px;" : ""}">${user.username}</div>
            </a>`
        }
        html += "</div>"
        var usersListEl = createElementFromHTML(html)
        try { usersEl.removeChild(usersEl.children[0]) } catch (e) { }
        usersEl.appendChild(usersListEl)
    })
}