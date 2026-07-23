import Scene from '../model/scene.js'
import Renderer from '../view/renderer.js'

/**
 * Game's main class, responsable for its initialization
 *  and loop. Manages model/view tasks and gets input but
 *  does not handle them
 *
 * @export
 * @class App
 * @typedef {App}
 */
export default class App {
    #canvas;
    #scene; #renderer;
    #deltaTime = 0; #lastFrame = 0;
    #keys = {};

    /**
     * Creates an instance of App.
     *
     * @constructor
     * @param {HTMLCanvasElement} canvas 
     * @param {WebGL2RenderingContext} gl 
     */
    constructor(canvas, gl) {
        this.#initGL(gl);
        this.#canvas = canvas;
        this.#lastFrame = Date.now();

        // Create renderer always before creating the scene
        this.#renderer = new Renderer(canvas, gl);
        this.#scene = new Scene();
        
        document.addEventListener('mousemove', (e) => this.#mouseMovementCallback(e));
        document.addEventListener('keydown', (e) => this.#keys[e.code] = true);
        document.addEventListener('keyup', (e) => this.#keys[e.code] = false);
    }

    /**
     * Main game loop. Calculates deltaTime, update scene's logic
     *  and render a new frame
     */
    run() {
        const currentFrame = Date.now();
        this.#deltaTime = (currentFrame - this.#lastFrame) / 1000.0;
        this.#lastFrame = currentFrame;

        this.#scene.update(this.#deltaTime, this.#keys);
        
        this.#renderer.render(this.#scene);

        requestAnimationFrame(this.run.bind(this));
    }

    /**
     * Initialize WebGL states and global settings
     *
     * @private
     * @param {WebGL2RenderingContext} gl 
     */
    #initGL(gl) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.enable(gl.DEPTH_TEST);
    }

    #mouseMovementCallback(event) {
        let mouseX = event.offsetX;
        let mouseY = event.offsetY;

        let xOffset = event.movementX;
        let yOffset = -event.movementY;

        this.#scene.camera.processMouseMovement(xOffset, yOffset);

        const mouseX_norm = (2.0 * mouseX) / this.#canvas.width - 1.0;
        const mouseY_norm = 1.0 - (2.0 * mouseY) / this.#canvas.height; // Y Inverted
        const aspectRatio = this.#canvas.width / this.#canvas.height; 
        this.#scene.processMouseOver(mouseX_norm, mouseY_norm, aspectRatio);
    }
}