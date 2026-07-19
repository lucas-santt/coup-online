import { OBJ } from "../../settings.js";
import { Vector3 } from "../../utils/wglm-classes.js";

import Coin from "./coin.js";

export default class CoinStack {
    coins;
    #heightPadding;

    constructor(position, coinsCount, heightPadding) {
        this.coins = [];
        this.heightPadding = heightPadding;

        for(let i=0; i<coinsCount; i++) this.#createCoin(position);
    }

    update(dt) {
        this.coins.forEach(coin => coin.update(dt));
    }

    #createCoin(position) {
        const heightPadding = (this.coins.length * this.heightPadding);
        const pos = Vector3.add(position, new Vector3(0, heightPadding, 0));
        this.coins.push(new Coin(pos, OBJ.coin.rotation, OBJ.coin.scale));
    }
}