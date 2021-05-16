axios.get("/api/tips").then(res => {
    var html = ""
    for (var tip of res.data) {
        html +=
            `<div class="tip">
        <div class="tip-title">
        <span class="tip-number">#${tip.number}</span> ${tip.title}</div>
        <div class="tip-category">${tip.category}</div>
        <video class="tip-content" src="/videos/${tip.content}.mp4" autoplay loop muted></video>
        <div class="tip-text">${tip.body.replaceAll("\n", "")}</div>
        </div>`
    }

    document.getElementById("content").innerHTML = html;
})