import App from './controller/app.js';

window.onload = main;

function main() {
    const canvas = document.getElementById('webgl-canvas');
    
    // Initialize WebGL 2 context
    const gl = canvas.getContext('webgl2');
    if (!gl) {
        console.error("WebGL 2 is not supported by your browser.");
        return;
    }

    const app = new App(canvas, gl);
    app.run();
}