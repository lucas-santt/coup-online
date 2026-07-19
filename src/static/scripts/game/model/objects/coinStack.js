import { OBJ } from "../../settings.js";
import { Vector3 } from "../../utils/wglm-classes.js";

import Coin from "./coin.js";

export default class CoinStack {
    position;
    #coins; #spentCoins;
    #heightPadding;

    constructor(position, coinsCount, heightPadding) {
        this.position = position;
        this.#coins = []; this.#spentCoins = new Set();
        this.#heightPadding = heightPadding;

        for(let i=0; i<coinsCount; i++) {
            this.#coins.push(this.#createCoin(position, i));
        }
    }

    update(dt) {
        this.#coins.forEach(coin => coin.update(dt));
        this.#spentCoins.forEach(coin => coin.update(dt));
    }

    spend() {
        // Assumes caller checks length
        const spentCoin = this.#coins.pop();
        this.#spentCoins.add(spentCoin);

        spentCoin.animator.positionAnimation({
            to: OBJ.coinBank.middlePos, 
            animTime: 1.0,
            callback: () => this.#spentCoins.delete(spentCoin)
        });
    }

    buy() {
        // Assumes caller checks length
        const newCoin = this.#createCoin(OBJ.coinBank.middlePos, 0);
        this.#coins.push(newCoin);
        
        const stackPosition = this.#getCoinPosition(this.position, this.#coins.length-1);
        newCoin.animator.positionAnimation({
            to: stackPosition,
            animTime: 1.0
        });
    }

    getCoins() {
        return [...this.#coins, ...this.#spentCoins];
    }

    #createCoin(position, index) {
        const pos = this.#getCoinPosition(position, index);
        return new Coin(pos, OBJ.coin.rotation, OBJ.coin.scale);
    }

    #getCoinPosition(position, index) {
        const padding = new Vector3(0, index * this.#heightPadding, 0);
        return Vector3.add(position, padding);
    }
}