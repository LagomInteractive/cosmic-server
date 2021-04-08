var cardTemplate = new Image();
var cardsEl = document.getElementById("cards");

cardTemplate.onload = () => {
	axios.get("/api/cards").then((res) => {
		for (var i = 0; i < 50; i++) {
			for (let card of res.data) {
				cardsEl.appendChild(drawCard(card));
			}
		}
	});
};

cardTemplate.src = "/img/card-template.png";

function drawCard(card) {
	var canvas = document.createElement("canvas");
	canvas.classList.add("card");
	canvas.width = 253;
	canvas.height = 358;

	var ctx = canvas.getContext("2d");

	var image = new Image();

	ctx.font = "30px Roboto";
	ctx.textAlign = "center";
	ctx.fillStyle = "white";

	image.onload = () => {
		ctx.drawImage(image, 30, 30, 200, 180);
		ctx.drawImage(cardTemplate, 0, 0, canvas.width, canvas.height);
		// Mana
		ctx.fillText(Math.floor(Math.random() * 10), 32, 45);
		// Dmg
		ctx.fillText(Math.floor(Math.random() * 10), 32, 330);
		// Hp
		ctx.fillText(Math.floor(Math.random() * 10), 220, 330);

		ctx.textAlign = "left";
		ctx.font = "20px Roboto";
		ctx.fillText(getRandomName(), 30, 220);
	};

	var testImages = [
		"example-profile-pic.png",
		"img1.png",
		"img2.png",
		"img3.png",
		"img4.png",
	];
	image.src =
		"/img/card-images/" +
		testImages[Math.floor(Math.random() * testImages.length)];

	return canvas;
}
