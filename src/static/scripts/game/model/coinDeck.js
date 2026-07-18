import { OBJ } from "../config.js";
import { Vector3 } from "../utils/wglm-classes.js";
import Coin from "./coin.js";
import SceneObject from "./sceneObject.js";

export default class CoinDeck extends SceneObject {
    coins;
    #heightPadding;

    constructor(initPos, coinsCount, heightPadding = OBJ.coin.heightPadding) {
        super(initPos, new Vector3(1, 1, 1), new Vector3(0, 0, 0));
        this.coins = [];
        this.heightPadding = heightPadding;

        for(let i=0; i<coinsCount; i++) this.#createCoin();
    }

    update(dt) {
        return;
    }

    #createCoin() {
        const padding = (this.coins.length * this.heightPadding);
        const pos = Vector3.add(this.position, new Vector3(0, padding, 0));
        this.coins.push(new Coin(pos, OBJ.coin.scale, OBJ.coin.rotation));
    }
}