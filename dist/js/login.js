var usernameInput = document.getElementById("username-input");
var passwordInput = document.getElementById("password-input");
var loginButton = document.getElementById("login-button");

usernameInput.placeholder = getRandomName();

usernameInput.focus();

usernameInput.oninput = () => {
	usernameInput.value = usernameInput.value.replace(/\W/g, "");
	getUser(usernameInput.value, (user) => {
		setLoginButtonState(
			true,
			user != null ? "Login as " + user.username : "Create account"
		);
	});
};

loginButton.onclick = () => {
	axios
		.post("/api/loginPass", {
			username: usernameInput.value,
			password: passwordInput.value,
		})
		.then((res) => {
			if (res.data.success) {
				localStorage.setItem("token", res.data.token);
				location.href = "/";
			} else {
				loginError(res.data.reason);
			}
		});
};

document.addEventListener("keypress", (e) => {
	if (e.key == "Enter") loginButton.click();
});

function setLoginButtonState(enabled, text = false) {
	if (enabled) loginButton.removeAttribute("disabled");
	else loginButton.setAttribute("disabled", "disabled");
	if (text) loginButton.innerText = text;
}

function loginError(msg) {
	document.getElementById("login-info").innerText = msg;
}
