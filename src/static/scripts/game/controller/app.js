import { GEOMETRY } from '../config.js';
import Scene from '../model/scene.js'
import Renderer from '../view/renderer.js'

export default class App {
    #scene; #renderer;
    #deltaTime = 0; #lastFrame = 0;
    #keys = {};

    constructor(canvas, gl) {
        this.#genCircleVertices();
        this.#initGL(gl);

        this.#scene = new Scene();
        this.#renderer = new Renderer(canvas, gl);
    

        document.addEventListener('mousemove', (e) => this.#mouseMovementCallback(e));
        document.addEventListener('keydown', (e) => this.#keys[e.code] = true);
        document.addEventListener('keyup', (e) => this.#keys[e.code] = false);
    }

    run() {
        const currentFrame = Date.now();
        this.#deltaTime = (currentFrame - this.#lastFrame) / 1000.0;
        this.#lastFrame = currentFrame;

        this.#scene.update(this.#deltaTime, this.#keys);
        
        this.#renderer.render(this.#scene);

        requestAnimationFrame(this.run.bind(this));
    }

    #initGL(gl) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.enable(gl.DEPTH_TEST);
    }

    #mouseMovementCallback(event) {
        let xOffset = event.movementX;
        let yOffset = -event.movementY;

        this.#scene.camera.processMouseMovement(xOffset, yOffset);
    }

    #genCircleVertices() {
        GEOMETRY.circle.vertices.push(0.0, 0.0, 0.0, 0.5, 0.5);
        for(let i=0; i< GEOMETRY.circle.resolution; i++) {
            const angle = (i/GEOMETRY.circle.resolution) * Math.PI * 2;

            const u = 0.5 + (Math.cos(angle) * 0.5);
            const v = 0.5 - (Math.sin(angle) * 0.5);

            GEOMETRY.circle.vertices.push(Math.cos(angle), Math.sin(angle), 0.0, u, v);
        };

        for(let i=1; i <= GEOMETRY.circle.resolution; i++) {
            const nexVert = (i==GEOMETRY.circle.resolution) ? 1 : i + 1;
            GEOMETRY.circle.indices.push(0, i, nexVert);
        };
    }
}