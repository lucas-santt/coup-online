import App from './controller/app.js';
import GameState from './state/game-state.js';
import Overlay from './ui/overlay.js';

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

    // Game logic connects independently of the renderer above -- per the
    // spec's "WebGL owns the table, DOM owns the UI" split, GameState has
    // no dependency on `app` and nothing here blocks on WebGL init.
    const matchId = new URLSearchParams(window.location.search).get('match');
    if (!matchId) {
        console.error('game.html loaded with no ?match= id -- nothing to connect to.');
        return;
    }
    Overlay.init();
    GameState.connect(matchId);
}