var selectedPack = document.getElementById("select-pack")

axios.get("/api/packs").then(res => {
    for (var name in res.data) {
        var pack = res.data[name]
        var entry = document.createElement("option")
        entry.value = pack.id;
        entry.innerText = name;
        selectedPack.appendChild(entry)
    }
})

function requestCodes() {
    if (selectedPack.value == "none") return;
    var request = {
        pack: selectedPack.value,
        size: document.getElementById("select-pack-size").value,
        amount: document.getElementById("amount-of-codes").value
    }
    axios.post("/api/generatePackCodes", request).then(res => {
        document.body.innerHTML = res.data
    })
}