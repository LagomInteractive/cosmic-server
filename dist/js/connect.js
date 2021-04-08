var token = localStorage.getItem("token");
if (token) {
	axios.post("/api/login", { token }).then((res) => {});
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
