import { Vector3 } from "../utils/wglm-classes.js";

import { GAME, INIT_CAM, OBJ, PLAYERS } from '../config.js';

import Card from "./card.js";
import Coin from "./coin.js";
import CoinStack from "./coinStack.js";
import Player from "./player.js";

export default class SceneBuilder {
    static configsApplied = false;

    static build() {
        if(!this.configsApplied) this.#applyConfigs();

        const players = this.#generatePlayers();
        const { drawPile, coinBank } = this.#generateSupply();
        return { players, drawPile, coinBank };
    }

    static #mirrorPos(v) { return Vector3.hadMult(v, new Vector3(-1, 1, 1)); }
    static #mirrorRot(v) { return Vector3.hadMult(v, new Vector3(1, -1, 1)); }

    static #applyConfigs() {
        const { playerDistance, sidePlayerDistance } = GAME;
        const { cardHeight, coinHeight, user, side, upper } = PLAYERS;
        PLAYERS.lSide = { pos: {}, rot: {}}
        const lSide = PLAYERS.lSide;

        // User Objects
        for(let key in user.pos) 
            user.pos[key] = Vector3.add(user.pos[key], INIT_CAM.position); 
    
        // Other Players Objects
        [upper.pos, side.pos].forEach(p => {
            for(let key in p) {
                p[key].y += key === "coinStack" ? coinHeight : cardHeight;
                p[key].z += playerDistance;
            }
        });

        for(let key in side.pos) {
            side.pos[key].x += sidePlayerDistance;
            lSide.pos[key] = this.#mirrorPos(side.pos[key]);
            if(side.rot[key]) lSide.rot[key] = this.#mirrorRot(side.rot[key]);
        }

        this.configsApplied = true;
    }

    static #generatePlayers() {
        const players = [PLAYERS.user, PLAYERS.side, PLAYERS.lSide, PLAYERS.upper];

        return players.map((p, idx) => {
            const coinStack = new CoinStack(p.pos.coinStack, GAME.playerCoinCount, PLAYERS.coinHeightPadding);

            const frontIdx = Math.floor(Math.random() * GAME.totalCardTypes);
            const backIdx  = Math.floor(Math.random() * GAME.totalCardTypes);

            const frontCard = new Card(frontIdx, p.pos.frontCard, p.rot.frontCard);
            const backCard  = new Card(backIdx,  p.pos.backCard,  p.rot.backCard);

            return new Player(idx, coinStack, frontCard, backCard);
        })
    }

    static #generateSupply() {
        const playerDist = GAME.playerDistance;
        const drawPile = [], coinBank = [];

        for(let i=0; i<OBJ.drawPile.count; i++) {
            const padding = i * OBJ.drawPile.heightPadding;
            const pos = Vector3.add(OBJ.drawPile.position, new Vector3(0, padding, playerDist));
            drawPile.push(new Card(0, pos, OBJ.drawPile.rotation));
        };

        for(let i=0; i<OBJ.coinBank.count; i++) {
            const padding = i * OBJ.coinBank.heightPadding;
            const pos = Vector3.add(OBJ.coinBank.position, new Vector3(0, padding, playerDist));
            coinBank.push(new Coin(pos, OBJ.coin.scale, OBJ.coin.rotation));
        };

        return { drawPile, coinBank };
    }
}