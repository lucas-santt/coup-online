import { Vector3 } from '../utils/wglm-classes.js';

import RenderableObject from './renderableObject.js';

export default class Coin extends RenderableObject {
    constructor(initPos, initScale, initRotation) {
        const rotation = new Vector3(initRotation.x, Math.random() * 360, initRotation.z);
        super(initPos, initScale, rotation);
    }

    update(dt) {
        return;
    }
}