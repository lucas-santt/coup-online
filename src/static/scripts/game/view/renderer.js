import {
    QUAD_VERTICES,
    CIRCLE_VERTICES,
    QUAD_INDICES,
    BACKGROUND_COLOR,
    CAMERA_ZOOM
} from '../config.js'
import {
    QUAD_VERTEX_SHADER,
    QUAD_FRAGMENT_SHADER,
    CIRCLE_VERTEX_SHADER,
    CIRCLE_FRAGMENT_SHADER
} from '../shaders.js'

import * as wlgm from '../utils/wglm.js'

import Mesh from './mesh.js'
import Material from './material.js'

export default class Renderer {
    canvas; gl; 

    #quadMesh; #quadMaterial;
    #circleMesh; #circleMaterial;

    constructor(canvas, gl) {
        this.canvas = canvas
        this.gl = gl;
        
        this.#makeAssets();
    }

    render(scene) {
        this.#updateCanvasResolution();

        this.gl.clearColor(...BACKGROUND_COLOR);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        // Sending projection and view matrices into shaders
        const projection = wlgm.perspective(
            wlgm.radians(CAMERA_ZOOM), // 45
            this.gl.drawingBufferWidth / this.gl.drawingBufferHeight,
            0.1,
            100
        );

        const shaders = [this.#quadMaterial.shader, this.#circleMaterial.shader];
        for(const s of shaders) {
            s.use();
            s.setMat4("projection", projection.flatten());
            s.setMat4("view", scene.camera.getView());
        }

        // Drawing scene objects
        this.#quadMaterial.shader.use();
        for(const card of scene.cards) {
            this.#quadMaterial.shader.setMat4("model", card.getModelTransform());
            this.#quadMesh.draw()
        }

        this.#circleMaterial.shader.use();
        for(const coin of scene.coins) {
            this.#circleMaterial.shader.setMat4("model", coin.getModelTransform());
            this.#circleMesh.draw();
        }

        const error = this.gl.getError();
        if (error !== this.gl.NO_ERROR) {
            console.error("WebGL Error:", error);
        }
    }

    #makeAssets() {
        // Create Materials and Meshes
        this.#quadMesh = new Mesh(this.gl, QUAD_VERTICES, QUAD_INDICES);
        this.#quadMaterial = new Material(
            this.gl,
            QUAD_VERTEX_SHADER,
            QUAD_FRAGMENT_SHADER,
            '/static/img/Template_Card.png'
        )

        this.#circleMesh = new Mesh(this.gl, CIRCLE_VERTICES);
        this.#circleMaterial = new Material(
            this.gl,
            CIRCLE_VERTEX_SHADER,
            CIRCLE_FRAGMENT_SHADER
        )
    }

    #updateCanvasResolution() {
        const dpr = window.devicePixelRatio || 1;
        const canvasWidth  = this.canvas.clientWidth;
        const canvasHeight = this.canvas.clientHeight;
        
        const actualWidth  = Math.floor(canvasWidth * dpr);
        const actualHeight = Math.floor(canvasHeight * dpr);

        if(this.canvas.width !== actualWidth || this.canvas.height !== actualHeight) {
            this.canvas.width  = actualWidth;
            this.canvas.height = actualHeight;
        }

        // Drawing buffer so the center of the canvas is always (0, 0)
        this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
    }
}