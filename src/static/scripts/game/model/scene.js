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

export default class Scene {
    camera;
    cards = []; coins = [];
    
    constructor() {
        this.camera = new Camera(INIT_CAM.position, new Vector3(0, 1, 0), INIT_CAM.yaw, INIT_CAM.pitch);

        this.#generateScene();
    }

    update(dt, keys) {
        this.processInput(dt, keys);

        for(let i=0; i<this.cards.length-1; i++) {
            const playerCards = this.cards[i];
            const playerCoins = this.coins[i];

            for(let j=0; j<playerCards.length-1; j++) 
                playerCards[j].update(dt);
            for(let j=0; j<playerCoins.length; j++)
                playerCoins[j].update(dt);
        }
    }

    processInput(dt, keys) {
        if(keys['KeyW']) this.camera.processKeyboardMovement(CameraMovement.FORWARD, dt);
        if(keys['KeyS']) this.camera.processKeyboardMovement(CameraMovement.BACKWARD, dt);
        if(keys['KeyA']) this.camera.processKeyboardMovement(CameraMovement.LEFT, dt);
        if(keys['KeyD']) this.camera.processKeyboardMovement(CameraMovement.RIGHT, dt);
    }

    #generateScene() {
        /*
            Generates default scene

            Gives each player an index:
                User: 0,
                Right Player: 1,
                Left Player:  2,
                Upper Player: 3
                Decks: 4
        */
        const playerDist = GAME.playerDistance;
        const sideDist   = GAME.sidePlayerDistance;
        for(let i=0; i<5; i++) {
            this.coins[i] = [];
            this.cards[i] = [];
        }

        this.#generateCoins();
        this.#generateCards();
        this.#generateDecks();
    }

    #mirrorPos(v)  { return Vector3.hadMult(v, new Vector3(-1, 1, 1)); }
    #mirrorRot(v)  { return Vector3.hadMult(v, new Vector3(1, -1, 1)); }

    #generateCoins() {
        const { playerDistance, sidePlayerDistance, playerCoinCount } = GAME;
        const { scale, rotation, height, heightPadding } = OBJ.coin;
        const { user, side, upper } = PLAYERS_OBJ;
        const mirrorVec = new Vector3(-1, 1, 1);

        const rightPos = new Vector3(sidePlayerDistance, height, playerDistance);
        const leftPos  = this.#mirrorPos(rightPos);
        const upperPos = new Vector3(0, height, playerDistance);

        const bases = [
            Vector3.add(INIT_CAM.position, user.coinsPos),
            Vector3.add(rightPos, side.coinsPos),
            Vector3.add(leftPos,  this.#mirrorPos(side.coinsPos)),
            Vector3.add(upperPos, upper.coinsPos)
        ];

        for(let i=0; i<playerCoinCount; i++) {
            const padding = i* heightPadding;
            
            bases.forEach((basePos, playerIdx) => {
                const pos = new Vector3(basePos.x, basePos.y + padding, basePos.z);
                this.coins[playerIdx].push(new Coin(pos, scale, rotation));
            })
        }
    }

    #getPlayerCardsBases() {
        const { playerDistance, sidePlayerDistance } = GAME;
        const { user, side, upper } = PLAYERS_OBJ;

        const rightPos = new Vector3(sidePlayerDistance, OBJ.card.height, playerDistance);
        const leftPos  = this.#mirrorPos(rightPos);
        const upperPos = new Vector3(0, 0, playerDistance);
        const upperBackPos = new Vector3(0, 0, playerDistance + 0.01);

        return [
            { // User
                frontPos: Vector3.add(INIT_CAM.position, user.cards.frontPos), frontRot: user.cards.frontRot,
                backPos:  Vector3.add(INIT_CAM.position, user.cards.backPos), backRot:  user.cards.backRot
            },
            { // Right
                frontPos: Vector3.add(rightPos, side.cards.frontPos), frontRot: side.cards.frontRot,
                backPos:  Vector3.add(rightPos, side.cards.backPos), backRot:  side.cards.backRot
            },
            { // Left
                frontPos: Vector3.add(leftPos, this.#mirrorPos(side.cards.frontPos)),
                frontRot: this.#mirrorRot(side.cards.frontRot),
                backPos:  Vector3.add(leftPos, this.#mirrorPos(side.cards.backPos)),
                backRot:  this.#mirrorRot(side.cards.backRot)
            },
            { // Upper
                frontPos: Vector3.add(upperPos, upper.cards.pos), frontRot: upper.cards.rot,
                backPos:  Vector3.add(upperBackPos, this.#mirrorPos(upper.cards.pos)), backRot:  upper.cards.rot
            }
        ];
    }

    #generateCards() {
        const bases = this.#getPlayerCardsBases();

        bases.forEach((base, playerIdx) => {
            const frontIdx = Math.floor(Math.random() * 4);
            const backIdx  = Math.floor(Math.random() * 4);
            this.cards[playerIdx].push(
                new Card(frontIdx, base.frontPos, base.frontRot),
                new Card(backIdx,  base.backPos,  base.backRot)
            );
        });
    }

    #generateDecks() {
        const playerDist = GAME.playerDistance;

        for(let i=0; i<OBJ.deck.count; i++) {
            const padding = i * OBJ.deck.heightPadding;
            const pos = Vector3.add(OBJ.deck.position, new Vector3(0, padding, playerDist));
            this.cards[4].push(new Card(0, pos, OBJ.deck.rotation));
        }

        for(let i=0; i<OBJ.coinsDeck.count; i++) {
            const padding = i * OBJ.coinsDeck.heightPadding;
            const pos = Vector3.add(OBJ.coinsDeck.position, new Vector3(0, padding, playerDist));
            this.coins[4].push(new Coin(0, pos, OBJ.coin.scale, OBJ.coin.rotation));
        }
    }
}