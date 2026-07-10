import * as wglm from '../utils/wglm.js'
import { Vector3 } from '../utils/wglm-classes.js'
import SceneObject from './sceneObject.js';

export default class Card extends SceneObject {
    movIdx = 0; timer = 0; perc = 0;

    constructor(initPos, initScale, initRotation) {
        super(initPos, initScale, initRotation);
    }

    update(dt) {
        this.timer += dt;
        this.perc = this.timer / this.animTime;
        
        if(this.perc >= 1) {
            this.timer = 0;
            this.perc = 0;
        }
    }
}