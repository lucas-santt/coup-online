import {
    GEOMETRY,
    INIT_CAM,
    GAME,
    OBJ,
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
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        // Sending projection and view matrices into shaders
        const projection = wlgm.perspective(
            wlgm.radians(INIT_CAM.zoom), // 45
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

        // Drawing scene objects
        this.#cardMaterial.bind(this.gl);
        for(const player of scene.players) {
            for(const card of player.cards) {
                this.#cardMaterial.shader.setMat4("model", card.getModelTransform());
                this.#cardMaterial.shader.setInt("uCardIdx", card.typeIdx + 1); // Sum one bcs of back card w/ idx 0

                this.#cardMesh.draw();
            }
        }
        for(const card of scene.supply[0]) {
            this.#cardMaterial.shader.setMat4("model", card.getModelTransform());
            this.#cardMesh.draw();
        }

        this.#coinMaterial.bind(this.gl);
        for(const player of scene.players) {
            for(const coin of player.coinStack.coins) {
                this.#coinMaterial.shader.setMat4("model", coin.getModelTransform());
                
                this.#coinMesh.draw();
            }
        }
        for(const coin of scene.supply[1]) {
            this.#coinMaterial.shader.setMat4("model", coin.getModelTransform());
            this.#coinMesh.draw();
        }

        const error = this.gl.getError();
        if (error !== this.gl.NO_ERROR) {
            console.error("WebGL Error:", error);
        }
    }

    #makeAssets() {
        // Create Materials and Meshes
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