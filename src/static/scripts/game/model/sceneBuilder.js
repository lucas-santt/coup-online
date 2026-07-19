import { GAME, INIT_CAM, OBJ, PLAYERS } from '../settings.js';
import { Vector3 } from "../utils/wglm-classes.js";

import Card from "./objects/card.js";
import Coin from "./objects/coin.js";
import CoinStack from "./objects/coinStack.js";
import Player from "./objects/player.js";

/**
 * Responsable for generating game's initial scene.
 *  Wich includes the manipulation of objects positions
 *  and rotations, and it's creation
 *
 * @export
 * @class SceneBuilder
 * @typedef {SceneBuilder}
 */
export default class SceneBuilder {
    static configsApplied = false;

    /**
     * Builds intial scene and return it's objects
     *
     * @static
     * @returns {{ players: Player[]; drawPile: Card[]; coinBank: Coin[]; }} 
     */
    static build() {
        if(!this.configsApplied) this.#applyInitialSettings();

        const players = this.#generatePlayers();
        const { drawPile, coinBank } = this.#generateSupply();
        return { players, drawPile, coinBank };
    }

    static #mirrorPos(v) { return Vector3.hadMult(v, new Vector3(-1, 1, 1)); }
    static #mirrorRot(v) { return Vector3.hadMult(v, new Vector3(1, -1, 1)); }

    
    /**
     * Apply initial settings of distance and camera to all
     *  objects of the scene.
     * Calculates players positions and rotations. Generating left 
     *  player positions and rotation from mirroring right player
     *
     * @private
     * @static
     */
    static #applyInitialSettings() {
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

    /**
     * Instantiate four players (user and right, left and upper players).
     * Each player have it's own coin stack and two cards
     * 
     * @private
     * @returns {Player[]} 
     */
    static #generatePlayers() {
        const players = [PLAYERS.user, PLAYERS.side, PLAYERS.lSide, PLAYERS.upper];

        return players.map((p, idx) => {
            // Create a new Player
            const coinStack = new CoinStack(p.pos.coinStack, GAME.playerCoinCount, PLAYERS.coinHeightPadding);

            const frontIdx = Math.floor(Math.random() * GAME.totalCardTypes);
            const backIdx  = Math.floor(Math.random() * GAME.totalCardTypes);

            const frontCard = new Card(frontIdx, p.pos.frontCard, p.rot.frontCard);
            const backCard  = new Card(backIdx,  p.pos.backCard,  p.rot.backCard);

            return new Player(idx, coinStack, frontCard, backCard);
        })
    }

    /**
     * Generates table central supplies: Draw pile and the coin bank.
     *  Stacking it by incrementing it's y axis.
     * Each supply is a static object, in other words, doesn't have a
     *  frame update logic, are only rendered in the screen.
     * 
     * @private
     * @returns {{ drawPile: Card[], coinBank: Coin[] }}
     */
    static #generateSupply() {
        const playerDist = GAME.playerDistance;
        const drawPile = [], coinBank = [];

        // First, the drawPile
        for(let i=0; i<OBJ.drawPile.count; i++) {
            const padding = i * OBJ.drawPile.heightPadding;
            const pos = Vector3.add(OBJ.drawPile.position, new Vector3(0, padding, playerDist));
            drawPile.push(new Card(0, pos, OBJ.drawPile.rotation));
        };

        // Then, the coinBank
        for(let i=0; i<OBJ.coinBank.count; i++) {
            const heightPadding = i * OBJ.coinBank.heightPadding;
            const pos = Vector3.add(OBJ.coinBank.position, new Vector3(0, heightPadding, playerDist));
            coinBank.push(new Coin(pos, OBJ.coin.rotation, OBJ.coin.scale));
        };

        return { drawPile, coinBank };
    }
}