import { OBJ } from "../settings.js";
import { Vector3 } from "../utils/wglm-classes.js";

import Coin from "./coin.js";

export default class CoinStack {
    position; coins;
    #heightPadding;

    constructor(initPos, coinsCount, heightPadding) {
        this.position = initPos;
        this.coins = [];
        this.heightPadding = heightPadding;

        for(let i=0; i<coinsCount; i++) this.#createCoin();
    }

    update(dt) {
        this.coins.forEach(coin => coin.update(dt));
    }

    #createCoin() {
        const heightPadding = (this.coins.length * this.heightPadding);
        const pos = Vector3.add(this.position, new Vector3(0, heightPadding, 0));
        this.coins.push(new Coin(pos, OBJ.coin.scale, OBJ.coin.rotation));
    }
}