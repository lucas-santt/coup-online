import { INIT_CAM } from '../settings.js'
import { Vector3 } from '../utils/wglm-classes.js'

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
        this.camera = new Camera(INIT_CAM.position, new Vector3(0, 1, 0), INIT_CAM.yaw, INIT_CAM.pitch);
        
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
    }
}