import { INIT_CAM } from '../settings.js'
import { Vector2, Vector3 } from '../utils/wglm-classes.js'

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

        if(keys['KeyC']) this.players[0].coinStack.spend(); keys['KeyC'] = false;
        if(keys['KeyV']) this.players[0].coinStack.buy();   keys['KeyV'] = false;
    }

    processHover(mouseX, mouseY, aspectRatio) {
        // Assumes mouse coords are ndc
        const screenPoint = new Vector2(mouseX, mouseY);
        const ray = this.camera.rayCast(SceneBuilder, aspectRatio);
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