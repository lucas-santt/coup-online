import { GEOMETRY, GAME, OBJ } from '../settings.js'
import {
    CARD_VERTEX_SHADER,
    CARD_FRAGMENT_SHADER,
    COIN_VERTEX_SHADER,
    COIN_FRAGMENT_SHADER
} from '../shaders.js'

import * as wglm from '../utils/wglm.js'

import Mesh from './mesh.js'
import Material from './material.js'

export default class Renderer {
    canvas; gl; 

    #cardMesh; #cardMaterial;
    #coinMesh; #coinMaterial;

    constructor(canvas, gl) {
        this.canvas = canvas
        this.gl = gl;
        
        this.#makeAssets();
    }

    render(scene) {
        this.#updateCanvasResolution();

        this.gl.clearColor(...GAME.backgroundColor);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.COLOR_BUFFER_BIT);

        // First, send projection and view matrices into shaders
        const projection = wglm.perspective(
            wglm.radians(scene.camera.zoom),
            this.gl.drawingBufferWidth / this.gl.drawingBufferHeight,
            0.1,
            100
        );

        const shaders = [this.#cardMaterial.shader, this.#coinMaterial.shader];
        for(const s of shaders) {
            s.use();
            s.setMat4("projection", projection.flatten());
            s.setMat4("view", scene.camera.getView());
        }

        // Then, Draw scene objects
        const { cards, coins } = scene.getAllObjects();
        // Cards first
        this.#cardMaterial.bind(this.gl);
        for(const c of cards) {
            this.#cardMaterial.shader.setMat4("model", c.getModelTransform());
            this.#cardMaterial.shader.setInt("uCardIdx", c.typeIdx + 1); // Sum one bcs of back card w/ idx 0

            this.#cardMesh.draw();
        }

        // Now, coins
        this.#coinMaterial.bind(this.gl);
        for(const c of coins) {
            this.#coinMaterial.shader.setMat4("model", c.getModelTransform());
            this.#coinMesh.draw();
        }

        // Logs any error for debugging
        const error = this.gl.getError();
        if (error !== this.gl.NO_ERROR) {
            console.error("WebGL Error:", error);
        }
    }

    /**
     * Create objects meshes and materials
     * 
     * @private
     */
    #makeAssets() {
        this.#cardMesh = new Mesh(this.gl, GEOMETRY.quad.vertices, GEOMETRY.quad.indices);
        this.#cardMaterial = new Material(
            this.gl,
            CARD_VERTEX_SHADER,
            CARD_FRAGMENT_SHADER,
            OBJ.card.textures
        )

        this.#coinMesh = new Mesh(this.gl, GEOMETRY.circle.vertices, GEOMETRY.circle.indices);
        this.#coinMaterial = new Material(
            this.gl,
            COIN_VERTEX_SHADER,
            COIN_FRAGMENT_SHADER,
            OBJ.coin.textures
        )
    }

    
    /** 
     * Update canvas resolution based on its aspect ratio
     * 
     * @private
     */
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