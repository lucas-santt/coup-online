import * as wglm from '../utils/wglm.js'
import { GAME } from '../settings.js'

import Mesh from './mesh.js'
import Material from './material.js'
import AssetManager from './assetManager.js'

export default class Renderer {
    static canvas = null;
    static gl = null;

    constructor(canvas, gl) {
        Renderer.canvas = canvas;
        Renderer.gl = gl;

        AssetManager.genCoinVertices();
        AssetManager.loadAssets();
    }

    render(scene) {
        const gl = Renderer.gl;
        this.#updateCanvasResolution();

        gl.clearColor(...GAME.backgroundColor);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

        // First, send projection and view matrices into shaders
        const projection = wglm.perspective(
            wglm.radians(scene.camera.zoom),
            gl.drawingBufferWidth / gl.drawingBufferHeight,
            0.1,
            100
        ).flatten();

        // Then, Draw scene objects
        const { cards, coins } = scene.getAllObjects();

        // Cards first
        let material = AssetManager.getMaterial("card");
        material.bind(projection, scene.camera.getView());
        for(const c of cards) {
            // Sum one bcs of back card w/ idx 0
            material.shader.setInt("uCardIdx", c.typeIdx + 1);
            c.draw();
        }

        // Now, coins
        material = AssetManager.getMaterial("coin");
        material.bind(projection, scene.camera.getView());
        for(const c of coins) 
            c.draw();

        // Logs any error for debugging
        const error = gl.getError();
        if (error !== gl.NO_ERROR) {
            console.error("WebGL Error:", error);
        }
    }
    
    /** 
     * Update canvas resolution based on its aspect ratio
     * 
     * @private
     */
    #updateCanvasResolution() {
        const canvas = Renderer.canvas;

        const dpr = window.devicePixelRatio || 1;
        const canvasWidth  = canvas.clientWidth;
        const canvasHeight = canvas.clientHeight;
        
        const actualWidth  = Math.floor(canvasWidth * dpr);
        const actualHeight = Math.floor(canvasHeight * dpr);

        if(canvas.width !== actualWidth || canvas.height !== actualHeight) {
            canvas.width  = actualWidth;
            canvas.height = actualHeight;
        }

        // Drawing buffer so the center of the canvas is always (0, 0)
        const gl = Renderer.gl;
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    }
}