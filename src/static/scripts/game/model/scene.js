import { 
    CAMERA_POSITION, 
    CAMERA_YAW, 
    CAMERA_PITCH 
} from '../config.js'

import {Vector3} from '../utils/wglm-classes.js'

import Camera from "./camera.js";
import Card from "./card.js";

export default class Scene {
    camera;
    cards = []; coins = [];
    
    constructor() {
        this.camera = new Camera(CAMERA_POSITION, new Vector3(0, 1, 0), CAMERA_YAW, CAMERA_PITCH);
        this.cards.push(new Card(new Vector3(0, 0, -3), new Vector3(0.5, 0.5, 1)));
    }

    update(dt) {
        for(const card of this.cards) card.update(dt);

        for(const coin of this.coins) coin.update(dt);
    }
}