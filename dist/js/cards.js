var cardTemplate = new Image();
var cardsEl = document.getElementById("cards");
var cards;

var onCardsReady = () => {};

cardTemplate.onload = () => {
	axios.get("/api/cards").then((res) => {
		cards = res.data;
		onCardsReady();

		if (cardsEl) {
			for (let card of res.data) {
				var el = drawCard(card);
				el.onclick = () => (location.href = "/cards/edit/" + card.id);
				cardsEl.appendChild(el);
			}
		}
	});
};

cardTemplate.src = "/img/card-template.png";

function drawCard(card, overwriteImage = false) {
	var isMinion = card.type == "minion";
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
		ctx.fillText(card.mana, 32, 45);
		// Dmg
		ctx.fillText(card.damage, 32, 330);
		// Hp
		if (isMinion) ctx.fillText(card.hp, 220, 330);

		// Draw name
		ctx.font = "20px Roboto";
		ctx.fillText(card.name, canvas.width / 2, 220);

		// Draw description
		let rows = card.description.split("\n");
		let yPos = 255;
		for (let row of rows) {
			ctx.font = "15px Roboto";
			ctx.textAlign = "left";

			var cleanString = row.split("$B").join("").split("$I").join("");

			let rowWidth = ctx.measureText(cleanString);

			let code = false;
			let bold = false;
			let italic = false;

			let xPos = canvas.width / 2 - rowWidth.actualBoundingBoxRight / 2;
			for (let char of row) {
				if (char == "$") code = true;
				else if (!code) {
					ctx.fillText(char, xPos, yPos);
					xPos += ctx.measureText(char).actualBoundingBoxRight;
				}

				if (char.toUpperCase() == "B" && code) {
					code = false;
					bold = !bold;
				}

				if (char.toUpperCase() == "I" && code) {
					code = false;
					italic = !italic;
				}

				ctx.font = `${italic ? "italic" : ""} ${
					bold ? "bold" : ""
				} 15px Roboto`;

				if (char == " ") xPos += 3;
			}
			console.log(rowWidth);
			yPos += 20;
		}

		var elementColors = {
			lunar: "rgb(0, 162, 255)",
			solar: "rgb(255, 38, 0)",
			zenith: "rgb(46, 255, 99)",
			nova: "rgb(147, 40, 246)",
		};

		// Draw element
		ctx.textAlign = "center";
		ctx.fillStyle = elementColors[card.element];
		ctx.font = "15px Roboto";
		ctx.fillText(card.element.toUpperCase(), canvas.width / 2, 32);

		// 3D Effect
		const height = canvas.clientHeight;
		const width = canvas.clientWidth;

		canvas.addEventListener("mousemove", (e) => {
			const xVal = e.layerX;
			const yVal = e.layerY;

			const yRotation = 20 * ((xVal - width / 2) / width);
			const xRotation = -20 * ((yVal - height / 2) / height);
			const string =
				"perspective(500px) rotateX(" +
				xRotation +
				"deg) rotateY(" +
				yRotation +
				"deg)";

			canvas.style.transform = string;
		});

		canvas.addEventListener("mouseout", () => {
			canvas.style.transform =
				"perspective(500px) scale(1) rotateX(0) rotateY(0)";
		});
	};

	image.src = overwriteImage
		? overwriteImage
		: card.lastChange
		? "/img/card-images/" + card.id + ".png"
		: "https://via.placeholder.com/500x500";

	return canvas;
}
