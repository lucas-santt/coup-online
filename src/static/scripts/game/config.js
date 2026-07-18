import { Vector3 } from './utils/wglm-classes.js'

export const GEOMETRY = {
    quad: {
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
    circle: {
        resolution: 24,
        vertices: [],
        indices: []
    }
}

export const GAME = {
    backgroundColor: [0.8941, 0.8314, 0.7373, 0],
    playerDistance: -4.0,
    sidePlayerDistance: 1.9,
    playerCoinCount: 7
}

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
        height: -0.9,
        heightPadding: 0.026,
        textures: [ '/static/img/Coin.png' ]
    },
    card: {
        scale: new Vector3(0.4, 0.42, 1.0),
        height: -0.7,
        textures: [
            '/static/img/Card - Back.png',
            '/static/img/Card - Captain v2.0.png'
        ]
    },
    deck: {
        count: 15,
        heightPadding: 0.01,
        position: new Vector3(-1.5, -1.0, -2.5),
        rotation: new Vector3(90, 45, 0.0)
    },
    coinsDeck: {
        count: 15,
        heightPadding: 0.02,
        position: new Vector3(-1.3, -1.0, -2.9),
    }
}

export const PLAYERS_OBJ = {
    user: {
        coinsPos: new Vector3(0.55, -2.4, -1.6),
        cards: {
            frontPos: new Vector3(-0.15, -2.1, -1.4),
            frontRot: new Vector3(-30.0, 0.0, 5.0),
            backPos:  new Vector3(0.15, -2.1, -1.39),
            backRot:  new Vector3(-30.0, 0.0, -5.0)
        }
    },
    side: {
        coinsPos: new Vector3(-0.2, 0.0, -1.0),
        cards: {
            frontPos: new Vector3(0.18, 0.0, -0.49),
            frontRot: new Vector3(-7.0, 140.0, 0.0),
            backPos:  new Vector3(0.0, 0.0, -0.7),
            backRot:  new Vector3(-5.0, 130.0, 0.0)
        }
    },
    upper: {
        coinsPos: new Vector3(0.5, 0.0, -2.6),
        cards: {
            pos: new Vector3(-0.15, -0.7, -2.5),
            rot: new Vector3(-10.0, -180.0, 0.0)
        }
    }
}