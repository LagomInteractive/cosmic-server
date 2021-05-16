var cardTemplates = {
    spell: null, minion: null, mask: null
}

for (let key in cardTemplates) {
    cardTemplates[key] = new Image()
    cardTemplates[key].onload = () => {
        cardTemplates[key].setAttribute("loaded", true)
        templateImagesLoaded()
    }
    cardTemplates[key].src = `/img/${key}-card.png`
}

var cardsEl = document.getElementById("cards");
var cards;

var cachedCards = {};

var onCardsReady = () => { };

function templateImagesLoaded() {
    // Check that all template images are loaded
    for (let key in cardTemplates) if (!cardTemplates[key].hasAttribute("loaded")) return

    axios.get("/api/cards").then((res) => {

        cards = res.data;
        onCardsReady();

        if (cardsEl) {
            loadCards(false);
            document.getElementById("search-cards").oninput = (e) => {
                loadCards(e.target.value);
            };
        }
    });
};

function sortCards(a, b) {
    var order = ["rush", "taunt", "lunar", "nova", "solar", "zenith"]
    var val = (order.indexOf(a.element) - order.indexOf(b.element))
    if (val != 0) return val
    return (a).mana - (b).mana
}

function loadCards(search = false) {
    cardsEl.innerHTML = "";

    cards.sort(sortCards)


    for (let card of cards) {
        if (search) {
            var searches = search.split(" ");
            var passed = true;
            for (let searchWord of searches) {
                if (
                    card.description
                        .toLowerCase()
                        .indexOf(searchWord.toLowerCase()) == -1 &&
                    card.name.toLowerCase().indexOf(searchWord.toLowerCase()) ==
                    -1 &&
                    card.element
                        .toLowerCase()
                        .indexOf(searchWord.toLowerCase()) == -1 &&
                    card.type.toLowerCase().indexOf(searchWord.toLowerCase()) ==
                    -1 &&
                    card.rarity.toLowerCase().indexOf(searchWord.toLowerCase()) ==
                    -1
                ) {
                    passed = false;
                    break;
                    /*|| card.rarity.toLowerCase().indexOf(search != -1)*/
                }
            }
            if (!passed) continue;
        }

        let el = drawCard(card);
        //el.onclick = () => (location.href = "/cards/edit/" + card.id);
        let link = document.createElement("a")
        link.href = "/cards/edit/" + card.id
        link.appendChild(el);

        cardsEl.appendChild(link);
    }
}

function getCard(id) {
    for (let card of cards) {
        if (card.id == id) {
            return card;
        }
    }
}


function drawCard(card, overwriteImage = false, animated = true) {

    // Draw description
    let description = card.description

    var result = ""
    var bold = false;
    var italic = false;

    for (var i = 0; i < description.length; i++) {
        let char = description[i]
        let next = description[i + 1]
        if (!next) next = ""
        if (next) next = next.toUpperCase()
        if (char == "\n") {
            bold = false;
            italic = false;
        }
        if (char == "$") {
            i++; // Skip the next character
            if ((next == 'B' && bold || next == 'I' && italic)) result += "</tspan>"
            else result += `<tspan style="${next == 'B' ? "font-weight:600;" : "font-style:italic;"}">`
            next == 'B' ? bold = !bold : italic = !italic;
        } else {
            result += char
        }
    }

    /* if (bold) result += "</tspan>"
    if (italic) result += "</tspan>" */

    result = result.split('\n')
    while (result.length < 4) result.push("")


    var imageSource = overwriteImage
        ? overwriteImage
        : card.lastChange
            ? " /img/card-images/" + card.id + ".png" : "/img/placeholder.png"
    var isMinion = card.type == "minion"

    var element = card.element;
    if (card.element == "rush" || card.element == "taunt") element = "neutral"

    var svg = createElementFromHTML(`
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
    viewBox="0 0 595.28 841.89" style="enable-background:new 0 0 595.28 841.89;" xml:space="preserve">
    <g id="Layer_1">
        <g>
            ${!isMinion ? `<defs>
                <path id="SVGID_2_" d="M62.41,481.62H543.8V105.56c0-14.46-11.73-26.19-26.19-26.19H62.41V481.62z" />
            </defs>
            <clipPath id="SVGID_3_">
                <use xlink:href="#SVGID_2_" style="overflow:visible;" />
            </clipPath>
            <g style="clip-path:url(#SVGID_3_);">

                <image style="overflow:visible;" width="357" height="500" xlink:href="${imageSource}"
                    transform="matrix(1.3438 0 0 1.3438 61.3534 10.3965)"> 
                </image>
            </g>` : `
            <defs>
                <ellipse id="SVGID_1_" cx="298" cy="286.39" rx="209.42" ry="242.62" />
            </defs>
            <clipPath id="SVGID_4_">
                <use xlink:href="#SVGID_1_" style="overflow:visible;" />
            </clipPath>
            <g style="clip-path:url(#SVGID_4_);">

                <image style="overflow:visible;" width="600" height="600" xlink:href="${imageSource}" x="-50"
                    transform="matrix(0.9612 0 0 0.9612 57.6885 38.7324)">
                </image>
            </g>`}

        </g>

        <image style="overflow:visible;" width="677" height="948" xlink:href="/img/${card.type == "minion" ? 'minion'
            : 'spell'}-card.png" transform="matrix(0.8173 0 0 0.8173 20.9887 33.5545)">
        </image>
        <image style="overflow:visible;" width="677" height="948" xlink:href="/img/rarities/${card.rarity}.png" transform="matrix(0.8173 0 0 0.8173 20.9887 33.5545)"></image>
        </text>
        SPELL</tspan>	</textPath>
        
        <text transform="matrix(1 0 0 1 68.4662 112.9744)"
            style="fill:#FFFFFF; font-family:'Cosmic'; font-size:50.4159px;" x="15"
            text-anchor="middle">${card.mana}</text>
       ${isMinion ? ` <text transform="matrix(1 0 0 1 63.5095 775.4306)"
       style="fill:#FFFFFF; font-family:'Cosmic'; font-size:50.4159px;" x="15"
       text-anchor="middle">${card.damage}</text>
   <text transform="matrix(1 0 0 1 512.332 775.4306)"
       style="fill:#FFFFFF; font-family:'Cosmic'; font-size:50.4159px;" x="15"
       text-anchor="middle">${card.hp}</text>` : ''}

        ${isMinion ? `<path id="SVGID_x5F_3_x5F_" style="fill:none;" d="M110.65,477.3c0,0,49.63,8.2,79.23,3.64s59.2-21.4,119.76-26.41
        s95.17-1.37,121.13,3.64c25.96,5.01,45.54,10.47,64.21,18.21" />
    <text>
        <textPath xlink:href="#SVGID_x5F_3_x5F_" startOffset="0.0244%" text-anchor="middle">
            <tspan style="fill:#FFFFFF; font-family:'Cosmic'; font-size:37px;" x="200">${card.name}</tspan>
        </textPath>
    </text>` : `
    <path id="SVGID_x5F_2_x5F_" style="fill:none;" d="M66.03,511.13c0,0,109.78-32.11,230.43-32.11s240.42,32.11,240.42,32.11"/>
<text><textPath startOffset="50%" text-anchor="middle"  xlink:href="#SVGID_x5F_2_x5F_" startOffset="0%">
<tspan  style="fill:#FFFFFF; font-family:'Cosmic'; font-size:37px;">${card.name}</tspan></textPath>
</text>`}
        <rect x="118.41" y="547.58" style="fill:none;" width="368.8" height="32.63" />
        <text transform="matrix(1 0 0 1 260.1373 569.8353)" style="fill:#FFFFFF; font-family:'Cosmic'; font-size:31px;"
            x="45" text-anchor="middle">${result[0]}</text>
        <rect x="118.41" y="583.33" style="fill:none;" width="368.8" height="32.63" />
        <text transform="matrix(1 0 0 1 257.4879 605.5885)" style="fill:#FFFFFF; font-family:'Cosmic'; font-size:31px;"
            x="45" text-anchor="middle">${result[1]}</text>
        <rect x="118.41" y="619.08" style="fill:none;" width="368.8" height="32.63" />
        <text transform="matrix(1 0 0 1 257.4879 641.3417)" style="fill:#FFFFFF; font-family:'Cosmic'; font-size:31px;"
            x="45" text-anchor="middle">${result[2]}</text>
        <rect x="118.41" y="654.84" style="fill:none;" width="368.8" height="32.63" />
        <text transform="matrix(1 0 0 1 257.4879 677.0949)" style="fill:#FFFFFF; font-family:'Cosmic'; font-size:31px;"
            x="45" text-anchor="middle">${result[3]}</text>
        <rect x="195.08" y="727.07" style="fill:none;" width="215.45" height="35.9" />
        <text transform="matrix(1 0 0 1 265.0035 756.149)"
            style="fill:var(--${element}); font-family:'Cosmic'; font-size:31px;">${element[0].toUpperCase() +
        element.substr(1)}</text>
    </g>
    <g id="Layer_2">
    </g>
</svg>
`)

    svg.classList.add("card")
    applyAnimation()

    function applyAnimation() {
        if (animated) {
            // 3D Effect
            const height = 287.85;
            const width = 390.47;

            svg.addEventListener("mousemove", (e) => {
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

                svg.style.transform = string;
            });

            svg.addEventListener("mouseout", () => {
                svg.style.transform =
                    "perspective(500px) scale(1) rotateX(0) rotateY(0)";
            });
        }
    }

    return svg;
}


function checkForCardProblems() {
    var problems = []
    for (var card of cards) {
        var hasFunctions = false;
        for (let event in card.events) {
            for (let func of card.events[event]) {
                if (["drawCard", "spawnMinion"].indexOf(func) != -1) {
                    if (!getCard(func.value)) problems.push(`CRITICAL! ${card.name}: Event ${event} func ${func.func} card with ID ${func.value} does not exsit!`)
                }
                hasFunctions = true;
                if (event.toLowerCase().indexOf("target") == -1) {
                    if (card.type != "targetSpell" && func.func.toLowerCase().indexOf("target") != -1) problems.push(`${card.name} (ID:${card.id}) event: ${event}, function: ${func.func}`)
                }
            }
        }
        if (card.type != "minion" && !hasFunctions) problems.push(`${card.name} (ID:${card.id}) Spell card has no functions`)
    }
    var message = "No problems! 🎉"
    if (problems.length > 0) message = problems.join("\n")
    alert(message)
}