const images = [
    "images/background.png",
    "images/background2.png",
    "images/background3.png",
    "images/background4.png"
];

let currentImage = 0;

setInterval(() => {
    currentImage = (currentImage + 1) % images.length;

    document.getElementById("background").src = images[currentImage];

}, 3 * 60 * 1000);
