var invenotry = document.getElementById("inventory");
var username = document.getElementById("profile-username").innerText;

onCardsReady = () => {
	getUser(username, (user) => {
		user.cards.sort();
		for (let card of user.cards) {
			var canvas = drawCard(getCard(card), false, false);
			canvas.classList.add("inventory-card");
			invenotry.appendChild(canvas);
		}
	});
};
