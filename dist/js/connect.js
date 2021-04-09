var token = localStorage.getItem("token");
var me;
if (token) {
	axios.post("/api/login", { token }).then((res) => {
		me = res.data.user;
	});
}

function getUser(username, callback) {
	axios.get("/api/user", { params: { username } }).then((res) => {
		callback(res.data);
	});
}

function logout() {
	localStorage.removeItem("token");
	axios.post("/api/logout").then((res) => {
		location.reload();
	});
}

function createElementFromHTML(htmlString) {
	var div = document.createElement("div");
	div.innerHTML = htmlString.trim();
	return div.firstChild;
}
