import { Vector3 } from "../../utils/wglm-classes.js";
import { OBJ, ANIM } from "../../settings.js";

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

    buy(numOfCoins = 1) {
        // Assumes caller checks length
        const delayTime = ANIM.coinStack.delayBetweenCoins * 1000;
        for(let i=0; i<numOfCoins; i++) {
            setTimeout(() => {
                this.#buyCoin();
            }, delayTime * i);
        };
    }

    spend(numOfCoins = 1) {
        // Assumes caller checks length
        const delayTime = ANIM.coinStack.delayBetweenCoins * 1000;
        for(let i=0; i<numOfCoins; i++) {
            setTimeout(() => {
                this.#spendCoin();
            }, delayTime * i)
        }
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

    async #buyCoin() {
        const { levitate, buy } = ANIM.coinStack;
        const newCoin = this.#createCoin(OBJ.coinBank.middlePos, 0);
        this.coins.push(newCoin);
        
        const stackPosition = this.#getCoinPosition(this.position, this.coins.length-1);
        const levitatePos = Vector3.add(stackPosition, levitate.positionOffset);

        // Translation
        await newCoin.animator.positionAnimation({
            to: levitatePos,
            ...buy
        })

        // Levitation
        await newCoin.animator.positionAnimation({
            to:stackPosition,
            ...levitate.animSettings
        });
    }

    async #spendCoin() {
        const { levitate, spend } = ANIM.coinStack;
        const spentCoin = this.coins.pop();
        const levitatePos = Vector3.add(
            spentCoin.position, 
            levitate.positionOffset
        );
        this.#spentCoins.add(spentCoin);

        // Levitation
        await spentCoin.animator.positionAnimation({
            to: levitatePos,
            ...levitate.animSettings
        })

        // Translation
        await spentCoin.animator.positionAnimation({
            to: OBJ.coinBank.middlePos,
            ...spend
        });
    }
}