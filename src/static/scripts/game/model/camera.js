import { Vector3 } from '../utils/wglm-classes.js'
import * as wglm from "../utils/wglm.js"

export const CameraMovement = {
    FORWARD: 'FORWARD',
    BACKWARD: 'BACKWARD',
    LEFT: 'LEFT',
    RIGHT: 'RIGHT',
    UP: 'UP',
    DOWN: 'DOWN'
};

export default class Camera {
    position;
    front; up; right;
    worldUp;

    yaw; pitch;

    #moveInputs;

    constructor(position, worldUp, yaw, pitch, moveInputs = false) {
        this.position = position;
        this.worldUp  = worldUp;
        this.yaw   = yaw;
        this.pitch = pitch;
        this.#moveInputs = moveInputs;

        this.#updateCameraVectors();
    }

    getView() {
        return wglm.lookAt(this.position, Vector3.add(this.position, this.front), this.up).flatten();
    }

    processKeyboardMovement(dir, deltaTime) {
        if(!this.#moveInputs) return;

        const vel = 2 * deltaTime;

        if(dir == CameraMovement.FORWARD)
            this.position = Vector3.add(this.position, Vector3.mult(this.front, vel));
        
        else if(dir == CameraMovement.BACKWARD)
            this.position = Vector3.subtract(this.position, Vector3.mult(this.front, vel));

        else if(dir == CameraMovement.LEFT)
            this.position = Vector3.subtract(this.position, Vector3.mult(this.right, vel));

        else if(dir == CameraMovement.RIGHT)
            this.position = Vector3.add(this.position, Vector3.mult(this.right, vel));
    }

    processMouseMovement(xOffset, yOffset, constraintPitch = true) {
        if(!this.#moveInputs) return;

        xOffset *= 0.5;
        yOffset *= 0.5;

        this.yaw   += xOffset;
        this.pitch += yOffset;

        if(constraintPitch){
            if(this.pitch > 89.0) this.pitch = 89.0;
            if(this.pitch < -89.0) this.pitch = -89.0;
        }

        this.#updateCameraVectors();
    }

    #updateCameraVectors() {
        const newFront = new Vector3();
        const yawRadians   = wglm.radians(this.yaw);
        const pitchRadians = wglm.radians(this.pitch);
        
        newFront.x = Math.cos(yawRadians) * Math.cos(pitchRadians);
        newFront.y = Math.sin(pitchRadians);
        newFront.z = Math.sin(yawRadians) * Math.cos(pitchRadians);

        this.front = wglm.normalize(newFront);
        this.right = wglm.normalize(wglm.cross(this.front, this.worldUp));
        this.up    = wglm.normalize(wglm.cross(this.right, this.front));
    }
}