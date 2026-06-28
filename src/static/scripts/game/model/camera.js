import { Vector3 } from '../utils/wglm-classes.js'
import * as wglm from "../utils/wglm.js"

export default class Camera {
    position;
    front; up; right;
    worldUp;

    yaw; pitch;

    constructor(position, worldUp, yaw, pitch) {
        this.position = position;
        this.worldUp  = worldUp;
        this.yaw   = yaw;
        this.pitch = pitch;

        this.#updateCameraVectors();
    }

    getView() {
        return wglm.lookAt(this.position, Vector3.add(this.position, this.front), this.up).flatten();
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