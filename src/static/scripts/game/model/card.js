import { Vector3 } from '../utils/wglm-classes.js'
import * as wglm from '../utils/wglm.js'

import { OBJ } from '../config.js';

import RenderableObject from './renderableObject.js';

export default class Card extends RenderableObject {
    movIdx = 0; timer = 0; perc = 0;

    typeIdx = 0;

    constructor(typeIdx, initPos, initRotation, initScale = OBJ.card.scale) {
        super(initPos, initScale, initRotation);
        this.typeIdx = typeIdx;
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