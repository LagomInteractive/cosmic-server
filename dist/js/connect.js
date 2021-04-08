var token = localStorage.getItem("token");
if (token) {
	axios.post("/api/login", { token }).then((res) => {
		console.log(res.data);
	});
}

function getUser(username, callback) {
	axios.get("/api/user", { params: { username } }).then((res) => {
		callback(res.data);
	});
}
