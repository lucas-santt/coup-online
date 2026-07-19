import { OBJ, ANIM } from "../../settings.js";
import { Vector3 } from "../../utils/wglm-classes.js";
import { easeInOutCurve } from "../../utils/wlgm-animation-curves.js";

import Coin from "./coin.js";

export default class CoinStack {
    position;
    coins; #spentCoins;
    #heightPadding;

    constructor(position, coinsCount, heightPadding) {
        this.position = position;
        this.coins = []; this.#spentCoins = new Set();
        this.#heightPadding = heightPadding;

        for(let i=0; i<coinsCount; i++) {
            this.coins.push(this.#createCoin(position, i));
        }
    }

    update(dt) {
        this.coins.forEach(coin => coin.update(dt));
        this.#spentCoins.forEach(coin => coin.update(dt));
    }

    buy() {
        // Assumes caller checks length
        const newCoin = this.#createCoin(OBJ.coinBank.middlePos, 0);
        this.coins.push(newCoin);
        
        const stackPosition = this.#getCoinPosition(this.position, this.coins.length-1);
        const animationConfig = {...ANIM.coinStack.buy, to: stackPosition }
        newCoin.animator.positionAnimation(animationConfig);
    }

    spend() {
        // Assumes caller checks length
        const spentCoin = this.coins.pop();
        this.#spentCoins.add(spentCoin);

        const animationConfig = {
            ...ANIM.coinStack.spend,
            to: OBJ.coinBank.middlePos,
            callback: () => this.#spentCoins.delete(spentCoin)
        }
        spentCoin.animator.positionAnimation(animationConfig);
    }

    getAllCoins() {
        return [...this.coins, ...this.#spentCoins];
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