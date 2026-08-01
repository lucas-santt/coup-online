/**
 *  @file Main settings for geometry, game and
 *  objects and players positions and rotations
 */
import { Vector3 } from './utils/wglm-classes.js'
import * as wglmAnim from "./utils/wlgm-animation-curves.js";

import * as shaders from './shaders.js';

export const GAME = {
    backgroundColor: [0.8941, 0.8314, 0.7373, 0],
    totalCardTypes: 4,
    playerDistance: -4.0,
    sidePlayerDistance: 1.9,
    playerCoinCount: 7
}

// Assets -----------------------

export const GEOMETRY = {
    card: {
        vertices: [
            // Pos           // TexCoords
           -0.5, -0.7, 0.0,  0.0, 1.0,   // bottom left
            0.5, -0.7, 0.0,  1.0, 1.0,   // bottom right
           -0.5,  0.7, 0.0,  0.0, 0.0,   // top    left
            0.5,  0.7, 0.0,  1.0, 0.0    // top    right
        ],
        indices: [
            0, 1, 2,
            1, 3, 2
        ]
    },
    coin: {
        resolution: 24
    }   
}

export const ASSETS = {
    card: {
        name: "card",
        vertexShader:   shaders.CARD_VERTEX_SHADER,
        fragmentShader: shaders.CARD_FRAGMENT_SHADER,
        textures: [
            '/static/assets/img/game/Card-Back.png',
            '/static/assets/img/game/Card-Ambassador_v2.0.png',
            '/static/assets/img/game/Card-Assassin_v2.0.png',
            '/static/assets/img/game/Card-Captain_v2.0.png',
            '/static/assets/img/game/Card-Contessa_v2.0.png',
			'/static/assets/img/game/Card-Duke_v2.0.png',
        ]
    },
    coin: {
        name: "coin",
        vertexShader:   shaders.COIN_VERTEX_SHADER,
        fragmentShader: shaders.COIN_FRAGMENT_SHADER,
        textures: [ '/static/assets/img/game/Coin.png' ]
    }
}

// Position, rotation and scale -----------------------

export const INIT_CAM = {
    position: new Vector3(0, 2, -1),
    yaw: -90,
    pitch: -40,
    zoom: 45
}

export const OBJ = {
    coin: {
        scale: new Vector3(0.08, 0.08, 1),
        rotation: new Vector3(90, 0, 0),
        textures: [ '/static/assets/img/game/Coin.png' ]
    },
    card: {
        scale: new Vector3(0.4, 0.42, 1.0),
        textures: [
            '/static/assets/img/game/Card-Back.png',
            '/static/assets/img/game/Card-Ambassador_v2.0.png',
            '/static/assets/img/game/Card-Assassin_v2.0.png',
            '/static/assets/img/game/Card-Captain_v2.0.png',
            '/static/assets/img/game/Card-Contessa_v2.0.png',
			'/static/assets/img/game/Card-Duke_v2.0.png',
        ]
    },
    drawPile: {
        count: 15,
        heightPadding: 0.01,
        position: new Vector3(-1.5, -1.0, -2.5),
        rotation: new Vector3(90, 45, 0.0)
    },
    coinBank: {
        count: 15,
        heightPadding: 0.02,
        position: new Vector3(-1.3, -1.0, -2.9),
    }
}

export const PLAYERS = {
    cardHeight: -0.7,
    coinHeight: -0.9,
    coinHeightPadding: 0.026,
    user: {
        pos: {
            coinStack: new Vector3( 0.55, -2.4,  -1.6),
            frontCard: new Vector3( 0.15, -2.1,  -1.39),
            backCard:  new Vector3(-0.15, -2.18, -1.45),
            loneCard:  new Vector3( 0.0,  -2.1,  -1.39)
        },
        rot: {
            frontCard: new Vector3(-30.0, 0.0, -5.0),
            backCard:  new Vector3(-30.0, 0.0,  5.0),
            loneCard:  new Vector3(-30.0, 0.0,  0.0)
        }
    },
    side: {
        pos: {
            coinStack: new Vector3(-0.2,  0.0, -1.0),
            frontCard: new Vector3( 0.18, 0.0, -0.49),
            backCard:  new Vector3( 0.0,  0.0, -0.7),
            loneCard:  new Vector3( 0.09, 0.0, -0.49)
        },
        rot: {
            frontCard: new Vector3(-7.0, 140.0, 0.0),
            backCard:  new Vector3(-5.0, 130.0, 0.0),
            loneCard:  new Vector3(-6.0, 135.0, 0.0)
        }
    },
    upper: {
        pos: {
            coinStack: new Vector3(-0.5,  0.0, -2.5),
            frontCard: new Vector3( 0.15, 0.0, -2.49),
            backCard:  new Vector3(-0.15, 0.0, -2.5),
            loneCard:  new Vector3( 0.0,  0.0, -2.49)
        },
        rot: {
            frontCard: new Vector3(-10.0, -180.0, 0.0),
            backCard:  new Vector3(-10.0, -180.0, 0.0),
            loneCard:  new Vector3(-10.0, -180.0, 0.0)
        }
    }
}

// Animation ------------------------------------

export const ANIM = {
    camera: {
        startLooking: {
            animTime: 1.0,
            animCurve: wglmAnim.linearCurve
        },
        looking: {
            animTime: 0.8,
            animCurve: wglmAnim.linearCurve
        },
        stopLooking: {
            animTime: 0.5,
            animCurve: wglmAnim.easeInOutCurve
        }
    },
    coinStack: {
        delayBetweenCoins: 0.2,
        levitate: {
            positionOffset: new Vector3(0.0, 0.2, 0.0),
            animSettings: {
                animTime: 0.2,
                animCurve: wglmAnim.easeOutBackCurve
            }
        },
        buy: {
            animTime: 1.0,
            animCurve: wglmAnim.easeInOutCurve
        },
        spend: { 
            animTime: 1.0,
            animCurve: wglmAnim.easeInOutCurve
        },
    },
    card: {
        moveTo: {
            animTime: 1.0,
            animCurve: wglmAnim.easeOutBackCurve
        },
        rotateTo: {
            animTime: 1.0,
            animCurve: wglmAnim.easeOutBackCurve
        },
        scaleTo: {
            animTime: 1.0,
            animCurve: wglmAnim.easeOutBackCurve
        },
        hover: {
            posOffset: new Vector3(0.0, 0.1, -0.06),
            animSettings: {
                animTime: 0.2,
                animCurve: wglmAnim.easeOutBackCurve
            }
        },
        levitateAboveHand: {
            levitateOffset: new Vector3(0, 0.6, -0.2),
            levitateAnim: {
                trans: {
                    animTime: 1.0,
                    animCurve: wglmAnim.easeOutQuintCurve
                },
                rot: {
                    animTime: 0.5,
                    animCurve: wglmAnim.easeOutQuintCurve
                }
            }
        },
        reveal: {
            revealedTime: 3,
            cameraZoom: 25,
            cameraStarePerc: 0.8,
            posOffset: new Vector3(0.0, 0.7, -0.4),
            rotOffset: new Vector3(0.0, 180.0, 0.0),
            trans: {
                animTime: 2.5,
                animCurve: wglmAnim.easeOutBackCurve
            },
            rot: {
                animTime: 0.75,
                animCurve: wglmAnim.easeOutBackCurve
            },
            inverseTrans: {
                animTime: 0.8,
                animCurve: wglmAnim.easeOutQuintCurve
            }
        },
        returnDrawPile: {
            drawPileOffset: new Vector3(0.5, 0.0, 0.5),
            trans: {
                animTime: 0.8,
                animCurve: wglmAnim.easeOutQuintCurve
            },
            rot: {
                animTime: 0.5,
                animCurve: wglmAnim.linearCurve
            },
            scale: {
                animTime: 0.5,
                animCurve: wglmAnim.linearCurve
            },
            drawPileTrans: {
                animTime: 0.9,
                animCurve: wglmAnim.linearCurve
            }
        },
        exchange: {
            translateAnim: {
                animTime: 1.25,
                animCurve: wglmAnim.easeOutQuintCurve
            }
        },
        disappear: {
            animTime: 1.0,
            animCurve: wglmAnim.linearCurve
        }
    },
    
}