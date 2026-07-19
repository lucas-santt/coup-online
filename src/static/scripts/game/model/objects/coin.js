import { Vector3 } from '../../utils/wglm-classes.js';

import Animator from '../animation.js';
import RenderableObject from './renderableObject.js';

export default class Coin extends RenderableObject {
    constructor(initPos, initRotation, initScale) {
        const rotation = new Vector3(initRotation.x, Math.random() * 360, initRotation.z);
        super(initPos, rotation, initScale);
    }

    update(dt) {
        super.update(dt);
    }
}