import Scene from '../model/scene.js'
import Renderer from '../view/renderer.js'

export default class App {
    #scene; #renderer;
    #deltaTime = 0; #lastFrame = 0;

    constructor(canvas, gl) {
        this.#scene = new Scene();
        this.#renderer = new Renderer(canvas, gl);
    }

    run() {
        const currentFrame = Date.now();
        this.#deltaTime = (currentFrame - this.#lastFrame) / 1000.0;
        this.#lastFrame = currentFrame;

        // TODO: Process inputs

        this.#scene.update(this.#deltaTime);
        
        this.#renderer.render(this.#scene);

        requestAnimationFrame(this.run.bind(this));
    }
}