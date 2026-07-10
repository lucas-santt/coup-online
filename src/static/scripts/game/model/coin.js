import SceneObject from './sceneObject.js';

export default class Coin extends SceneObject {
    constructor(initPos, initScale, initRotation) {
        super(initPos, initScale, initRotation);
    }

    update(dt) {
        console.log("Coin Update!");
    }
}