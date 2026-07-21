import { INIT_CAM } from '../settings.js';
import { Vector2, Vector3, Ray } from '../utils/wglm-classes.js'
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
    yaw; pitch;
    zoom; // Or FOV Y in radians
    
    #worldUp;
    #front; #up; #right;

    #allowMovement;

    constructor(position, worldUp, yaw, pitch, zoom, allowMovement = false) {
        this.position = position;
        this.yaw   = yaw;
        this.pitch = pitch;
        this.zoom = zoom;
        this.#worldUp  = worldUp;
        this.#allowMovement = allowMovement;

        this.#updateCameraVectors();
    }

    /**
     * Generates lookAt matrix, in wich transforms any point into
     *  the camera viewspace. Need to be applied in a shader
     *
     * @returns {Float32Array} 
     */
    getView() {
        return wglm.lookAt(this.position, Vector3.add(this.position, this.#front), this.#up).flatten();
    }

    rayCast(ndcPoint, aspectRatio) {
        const fovy = wglm.radians(this.zoom);
        const tanHalfFovy = Math.tan(fovy / 2.0); // Equals to half of the near plane height

        // Projecting screen point into near plane
        let viewPoint = Vector2.mult(ndcPoint, tanHalfFovy);
        viewPoint.x *= aspectRatio;

        // Rotating the ray according to camera's rotattion
        const rayDirRight = Vector3.mult(this.#right, viewPoint.x);
        const rayDirUp    = Vector3.mult(this.#up, viewPoint.y);

        let rayDir = Vector3.add(this.#front, rayDirRight);
        rayDir = Vector3.add(rayDir, rayDirUp);

        return new Ray(this.position.clone(), wglm.normalize(rayDir));
        
    }

    processKeyboardMovement(dir, deltaTime) {
        if(!this.#allowMovement) return;

        const vel = 2 * deltaTime;

        if(dir == CameraMovement.FORWARD)
            this.position = Vector3.add(this.position, Vector3.mult(this.#front, vel));
        
        else if(dir == CameraMovement.BACKWARD)
            this.position = Vector3.subtract(this.position, Vector3.mult(this.#front, vel));

        else if(dir == CameraMovement.LEFT)
            this.position = Vector3.subtract(this.position, Vector3.mult(this.#right, vel));

        else if(dir == CameraMovement.RIGHT)
            this.position = Vector3.add(this.position, Vector3.mult(this.#right, vel));
    }

    processMouseMovement(xOffset, yOffset, constraintPitch = true) {
        if(!this.#allowMovement) return;

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

    /** 
     * Updates camera's front, right and up vectors.
     *  Which are essential for the lookAt matrix creation
     */
    #updateCameraVectors() {
        const newFront = new Vector3();
        const yawRadians   = wglm.radians(this.yaw);
        const pitchRadians = wglm.radians(this.pitch);
        
        newFront.x = Math.cos(yawRadians) * Math.cos(pitchRadians);
        newFront.y = Math.sin(pitchRadians);
        newFront.z = Math.sin(yawRadians) * Math.cos(pitchRadians);

        this.#front = wglm.normalize(newFront);
        this.#right = wglm.normalize(Vector3.cross(this.#front, this.#worldUp));
        this.#up    = wglm.normalize(Vector3.cross(this.#right, this.#front));
    }
}