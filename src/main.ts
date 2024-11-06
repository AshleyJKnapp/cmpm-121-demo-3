// todo
const app: HTMLDivElement = document.querySelector("#app")!;

const testBtn = document.createElement("button");
testBtn.innerHTML = "Test";
app.append(testBtn)

testBtn.addEventListener("click", function () {
    alert("Button Clicked");
});