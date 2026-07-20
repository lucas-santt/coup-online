import { OBJ } from '../../settings.js';
import { Vector3 } from '../../utils/wglm-classes.js'
import * as wglm from '../../utils/wglm.js'

import RenderableObject from './renderableObject.js';

export default class Card extends RenderableObject {
    typeIdx = 0;

    constructor(typeIdx, initPos, initRotation, initScale = OBJ.card.scale) {
        super(initPos, initRotation, initScale);
        this.typeIdx = typeIdx;
    }

    update(dt) {
        super.update(dt);
    }
}