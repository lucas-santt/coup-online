import {
    GEOMETRY,
    INIT_CAM,
    GAME,
} from '../config.js'
import {
    CARD_VERTEX_SHADER,
    CARD_FRAGMENT_SHADER,
    COIN_VERTEX_SHADER,
    COIN_FRAGMENT_SHADER
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

        this.gl.clearColor(...GAME.backgroundColor);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        // Sending projection and view matrices into shaders
        const projection = wlgm.perspective(
            wlgm.radians(INIT_CAM.zoom), // 45
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
        this.#quadMaterial.bind(this.gl);
        for(const playerCards of scene.cards) {
            for(const card of playerCards) {
                this.#quadMaterial.shader.setMat4("model", card.getModelTransform());
                this.#quadMesh.draw();
            }
        }

        this.#circleMaterial.bind(this.gl);
        for(const playerCoins of scene.coins) {
            for(const coin of playerCoins) {
                this.#circleMaterial.shader.setMat4("model", coin.getModelTransform());
                this.#circleMesh.draw();
            }
        }

        const error = this.gl.getError();
        if (error !== this.gl.NO_ERROR) {
            console.error("WebGL Error:", error);
        }
    }

    #makeAssets() {
        // Create Materials and Meshes
        this.#quadMesh = new Mesh(this.gl, GEOMETRY.quad.vertices, GEOMETRY.quad.indices);
        this.#quadMaterial = new Material(
            this.gl,
            CARD_VERTEX_SHADER,
            CARD_FRAGMENT_SHADER,
            [
                '/static/img/Card - Back.png',
                '/static/img/Card - Captain v2.0.png'
            ]
        )

        this.#circleMesh = new Mesh(this.gl, GEOMETRY.circle.vertices, GEOMETRY.circle.indices);
        this.#circleMaterial = new Material(
            this.gl,
            COIN_VERTEX_SHADER,
            COIN_FRAGMENT_SHADER,
            ['/static/img/Coin.png']
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