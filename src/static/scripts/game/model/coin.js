import SceneObject from './sceneObject.js';
import { Vector3 } from '../utils/wglm-classes.js';

export default class Coin extends SceneObject {
    constructor(initPos, initScale, initRotation) {
        const rotation = new Vector3(initRotation.x, Math.random() * 360, initRotation.z);
        super(initPos, initScale, rotation);
    }

    update(dt) {
        return;
    }
}