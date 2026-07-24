import * as wglm from '../utils/wglm.js'
import { Vector3 } from '../utils/wglm-classes.js'
import SceneObject from './sceneObject.js';

export default class Card extends SceneObject {
    movIdx = 0; timer = 0; perc = 0;
    movPositions = [];
    animTime;

    constructor(initPos, initScale) {
        super(initPos, initScale);

        this.animTime = 1;

        this.movPositions[0] = Vector3.add(
            this.position, new Vector3(-0.5, -0.5, 0.0)
        )
        this.movPositions[1] = Vector3.add(
            this.position, new Vector3(0.0, 0.5, 0.0)
        )
        this.movPositions[2] = Vector3.add(
            this.position, new Vector3(0.5, -0.5, 0.0)
        )
    }

    update(dt) {
        this.timer += dt;
        this.perc = this.timer / this.animTime;
        
        if(this.perc >= 1) {
            this.movIdx = (this.movIdx + 1) % 3;
            this.timer = 0;
            this.perc = 0;
        }

        switch(this.movIdx){
            case 0:
                this.position = wglm.lerpVector3(
                    this.movPositions[0],
                    this.movPositions[1],
                    this.perc
                )
                break;
            case 1:
                this.position = wglm.lerpVector3(
                    this.movPositions[1],
                    this.movPositions[2],
                    this.perc
                )
                break;
            case 2:
                this.position = wglm.lerpVector3(
                    this.movPositions[2],
                    this.movPositions[0],
                    this.perc
                )
                break;
        }
    }
}