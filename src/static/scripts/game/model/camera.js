import * as wglm from "../utils/wglm.js";
import { Vector2, Vector3, Ray } from '../utils/wglm-classes.js';
import { ANIM } from "../settings.js";

import { CameraAnimator } from "../view/animation.js";

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

    animator;
    ogPos; ogZoom;
    ogYaw; ogPitch;
    
    #worldUp;
    #front; #up; #right;

    #lookTarget;
    #looking = false;

    #allowMovement;

    constructor(position, worldUp, yaw, pitch, zoom, allowMovement = false) {
        this.position = position;
        this.yaw   = yaw;
        this.pitch = pitch;
        this.zoom = zoom;

        this.animator = new CameraAnimator(this);
        this.ogPos = position;
        this.ogYaw = yaw, this.ogPitch = pitch;
        this.ogZoom = zoom;
        
        this.#worldUp  = worldUp;
        this.#allowMovement = allowMovement;

        this.#updateCameraVectors();
    }

    update(dt) {
        this.animator.update(dt);

        if(this.#looking) this.#lookObject();

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
     
    /**
     * Creates a ray wich originates from the camera
     *  and points into a screen point (transformed into 3D)
     *
     * @param {Vector2} ndcPoint 
     * @param {Number} aspectRatio 
     * @returns {Ray} 
     */
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

        return new Ray(this.position.clone(), Vector3.normalize(rayDir));
        
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

    startLooking(object, zoom = null){
        this.#lookTarget = object;
        this.#looking = true;

        if(zoom == null) return;
        this.animator.zoomAnimation({ to: zoom, ...ANIM.camera.startLooking });
    }

    stopLooking() {
        const { stopLooking } = ANIM.camera
        this.#lookTarget = null;
        this.#looking = false;

        this.animator.zoomAnimation({to: this.ogZoom, ...stopLooking});
        this.animator.pitchAnimation({to: this.ogPitch, ...stopLooking});
        this.animator.yawAnimation({to: this.ogYaw, ...stopLooking});
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

        this.#front = Vector3.normalize(newFront);
        this.#right = Vector3.normalize(Vector3.cross(this.#front, this.#worldUp));
        this.#up    = Vector3.normalize(Vector3.cross(this.#right, this.#front));
    }

    async #lookObject() {
        const { looking } = ANIM.camera;
        let { pitch, yaw } = this.#lookAngle(this.#lookTarget.position);

        if(pitch > 89.0)  pitch = 89.0;
        if(pitch < -89.0) pitch = -89.0;

        await Promise.all([
            this.animator.pitchAnimation({to: pitch, ...looking}),
            this.animator.yawAnimation({to: yaw, ...looking})
        ])
    }

    #lookAngle(point) {
        let dir = Vector3.subtract(this.#lookTarget.position, this.position);
        dir = Vector3.normalize(dir);

        const pitchRad = Math.asin(dir.y);
        // why atan2: Look the "ground" plane from above
        const yawRad   = Math.atan2(dir.z, dir.x);
        
        const pitch = wglm.degrees(pitchRad);
        const yaw   = wglm.degrees(yawRad);
        return { pitch, yaw };
    }
}