import { INIT_CAM } from '../settings.js'
import { Vector2, Vector3 } from '../utils/wglm-classes.js'
import * as wglm from '../utils/wglm.js'

import Camera, { CameraMovement } from "./camera.js";
import SceneBuilder from './sceneBuilder.js';

/**
 * Responsable for the management of each
 *  object, its frame logic update and 
 *  keyboard input
 *
 * @export
 * @class Scene
 * @typedef {Scene}
 */
export default class Scene {
    camera; players;
    drawPile; coinBank;

    #hoveredObject = null;
    
    constructor() {
        this.camera = new Camera(INIT_CAM.position, new Vector3(0, 1, 0), INIT_CAM.yaw, INIT_CAM.pitch, INIT_CAM.zoom);
        
        const { players, drawPile, coinBank } = SceneBuilder.build();
        this.players  = players;
        this.drawPile = drawPile;
        this.coinBank = coinBank; 
    }

    update(dt, keys) {
        this.processInput(dt, keys);

        this.players.forEach(player => player.update(dt));
    }

    processInput(dt, keys) {
        if(keys['KeyW']) this.camera.processKeyboardMovement(CameraMovement.FORWARD, dt);
        if(keys['KeyS']) this.camera.processKeyboardMovement(CameraMovement.BACKWARD, dt);
        if(keys['KeyA']) this.camera.processKeyboardMovement(CameraMovement.LEFT, dt);
        if(keys['KeyD']) this.camera.processKeyboardMovement(CameraMovement.RIGHT, dt);

        if(keys['KeyC']) this.players[0].coinStack.spend(2); keys['KeyC'] = false;
        if(keys['KeyV']) this.players[0].coinStack.buy(2);   keys['KeyV'] = false;
    }

    
    /**
     * Checks if mouse is hovering an object
     * Only works for renderable objects
     * 
     * Assumes mouse coords are already in
     *  normalized device coordinates (ndc)
     *
     * If hovering an object, calls respective
     *  onMouseEnter and onMouseExit functions
     * 
     * @param {Number} mouseX 
     * @param {Number} mouseY 
     * @param {Number} aspectRatio 
     */
    processMouseOver(mouseX, mouseY, aspectRatio) {
        const screenPoint = new Vector2(mouseX, mouseY);
        const ray = this.camera.rayCast(screenPoint, aspectRatio);
        
        const iterableObjects = this.players[0].cards; // For now...

        let closestObj = null;
        let closestHit = null;
        let minDist = Infinity;
        for(const ro of iterableObjects) {
            const hit = ro.intersectRay(ray);

            if(hit) {
                const dist = wglm.distanceSquared(hit, ray.origin);

                if(dist < minDist) {
                    minDist = dist;
                    closestObj = ro;
                    closestHit = hit;
                }
            }
        }

        if(this.#hoveredObject != closestObj) {
            if(this.#hoveredObject) this.#hoveredObject.onMouseExit();
            if(closestObj) closestObj.onMouseEnter(closestHit);
            this.#hoveredObject = closestObj;
        } else {
            if(this.#hoveredObject) 
                this.#hoveredObject.onMouseOver(closestHit);
        }
    }

    getAllObjects() {
        const cards = [...this.drawPile];
        const coins = [...this.coinBank];

        for(const p of this.players) {
            cards.push(...p.cards);
            coins.push(...p.coinStack.getAllCoins());
        }
        return { cards, coins };
    }
}