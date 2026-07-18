import { 
    GAME,
    INIT_CAM,
    OBJ,
    PLAYERS_OBJ,
} from '../config.js'

import { Vector3 } from '../utils/wglm-classes.js'

import Camera, { CameraMovement } from "./camera.js";
import Card from "./card.js";
import Coin from "./coin.js";
import CoinStack from './coinStack.js';
import Player   from './player.js'

export default class Scene {
    camera; players; supply;
    
    constructor() {
        this.camera = new Camera(INIT_CAM.position, new Vector3(0, 1, 0), INIT_CAM.yaw, INIT_CAM.pitch);
        this.supply =[[], []]

        this.#generateScene();
    }

    update(dt, keys) {
        this.processInput(dt, keys);

        this.players.forEach(player => player.update(dt));
    }

    processInput(dt, keys) {
        if(keys['KeyW']) this.camera.processKeyboardMovement(CameraMovement.FORWARD, dt);
        if(keys['KeyS']) this.camera.processKeyboardMovement(CameraMovement.BACKWARD, dt);
        if(keys['KeyA']) this.camera.processKeyboardMovement(CameraMovement.LEFT, dt);
        if(keys['KeyD']) this.camera.processKeyboardMovement(CameraMovement.RIGHT, dt);
    }

    #generateScene() {
        this.players = this.#generatePlayers();
        this.#generateSupply();
    }

    #mirrorPos(v)  { return Vector3.hadMult(v, new Vector3(-1, 1, 1)); }
    #mirrorRot(v)  { return Vector3.hadMult(v, new Vector3(1, -1, 1)); }

    #getPlayerBases() {
        const { playerDistance, sidePlayerDistance } = GAME;
        const { user, side, upper } = PLAYERS_OBJ;
        const coinHeight = OBJ.coin.height;
        const cardHeight = OBJ.card.height;

        const rightCardPos = new Vector3(sidePlayerDistance, cardHeight, playerDistance);
        const leftCardPos  = this.#mirrorPos(rightCardPos);
        const rightCoinPos = new Vector3(sidePlayerDistance, coinHeight, playerDistance);
        const leftCoinPos  = this.#mirrorPos(rightCoinPos);
        const upperCoinPos = new Vector3(0, coinHeight, playerDistance);

        return [
            { // User
                coinPos:      Vector3.add(INIT_CAM.position, user.coinsPos),
                cardFrontPos: Vector3.add(INIT_CAM.position, user.cards.frontPos),
                cardFrontRot: user.cards.frontRot,
                cardBackPos:  Vector3.add(INIT_CAM.position, user.cards.backPos),
                cardBackRot:  user.cards.backRot
            },
            { // Right Player
                coinPos:      Vector3.add(rightCoinPos, side.coinsPos),
                cardFrontPos: Vector3.add(rightCardPos, side.cards.frontPos),
                cardFrontRot: side.cards.frontRot,
                cardBackPos:  Vector3.add(rightCardPos, side.cards.backPos),
                cardBackRot:  side.cards.backRot
            },
            { // Left Player
                coinPos:      Vector3.add(leftCoinPos, this.#mirrorPos(side.coinsPos)),
                cardFrontPos: Vector3.add(leftCardPos, this.#mirrorPos(side.cards.frontPos)),
                cardFrontRot: this.#mirrorRot(side.cards.frontRot),
                cardBackPos:  Vector3.add(leftCardPos, this.#mirrorRot(side.cards.backPos)),
                cardBackRot:  this.#mirrorRot(side.cards.backRot)
            },
            { // Upper Player
                coinPos:      Vector3.add(upperCoinPos, upper.coinsPos),
                cardFrontPos: Vector3.add(upper.cards.pos, new Vector3(0, 0, playerDistance)),
                cardFrontRot: upper.cards.rot,
                cardBackPos:  Vector3.add(this.#mirrorPos(upper.cards.pos), new Vector3(0, 0, playerDistance + 0.01)),
                cardBackRot:  upper.cards.rot
            }
        ];
    }

    #generatePlayers() {
        const bases = this.#getPlayerBases();

        return bases.map((base, idx) => {
            const coinStack = new CoinStack(base.coinPos, GAME.playerCoinCount);

            const frontIdx = Math.floor(Math.random() * 4);
            const backIdx  = Math.floor(Math.random() * 4);

            const frontCard = new Card(frontIdx, base.cardFrontPos, base.cardFrontRot);
            const backCard  = new Card(backIdx,  base.cardBackPos,  base.cardBackRot);

            return new Player(idx, coinStack, frontCard, backCard);
        })
    }

    #generateSupply() {
        const playerDist = GAME.playerDistance;

        for(let i=0; i<OBJ.drawPile.count; i++) {
            const padding = i * OBJ.drawPile.heightPadding;
            const pos = Vector3.add(OBJ.drawPile.position, new Vector3(0, padding, playerDist));
            this.supply[0].push(new Card(0, pos, OBJ.drawPile.rotation));
        };

        for(let i=0; i<OBJ.coinBank.count; i++) {
            const padding = i * OBJ.coinBank.heightPadding;
            const pos = Vector3.add(OBJ.coinBank.position, new Vector3(0, padding, playerDist));
            this.supply[1].push(new Coin(pos, OBJ.coin.scale, OBJ.coin.rotation));
        };
    }
}