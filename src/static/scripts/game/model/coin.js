import SceneObject from './sceneObject.js';

export default class Coin extends SceneObject {
    constructor(initPos, initScale) {
        super(initPos, initScale);
    }

    update(dt) {
        console.log("Coin Update!");
    }
}