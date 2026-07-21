/**
 *  @file Utility model for essencial math functions
 * 
  */
import { Mat4, Vector3 } from "./wglm-classes.js"

// ------------- Math functions -------------

/**
 * Linear interpolation of a constant
 * 
 * @param {number} start 
 * @param {number} end 
 * @param {number} t Interpolation factor
 * @returns {number}
 */
export function lerp(start, end, t) {
    return start + (end-start) * t;
}

/**
 * Easing function for ease-in and ease-out
 *
 * @export
 * @param {number} t Linear factor between 0 and 1 
 * @returns {number} 
 */
export function smoothstep(t) {
    const clampedT = Math.max(0, Math.min(1, t));
    return clampedT * clampedT * (3 - 2 * clampedT);
}

export function radians(degreesAngle) {
    return degreesAngle * (Math.PI / 180.0);
}

// ------------- Vectors -------------

/**
 * Calculates the distance between two points
 * 
 * @param {Vector3} p1 
 * @param {Vector3} p2 
 * @returns {number}
 */
export function distance(p1, p2) {
    /* Returns distance between two points */
    return Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
}

// ------------- Transformation Matrices -------------

/**
 * Generates View Matrix based on the camera's position,
 *  point in wich it's looking at and it's up vector
 * 
 * @param {Vector3} eye 
 * @param {Vector3} center 
 * @param {Vector3} up 
 * @returns {Mat4}
 */
export function lookAt(eye, center, up) {
    let lam = new Mat4(0);

    let forward = Vector3.normalize(Vector3.subtract(eye, center));
    let right   = Vector3.normalize(Vector3.cross(up, forward));
    let trueUp  = Vector3.cross(forward, right);

    let translationX = -Vector3.dot(right, eye);
    let translationY = -Vector3.dot(trueUp, eye);
    let translationZ = -Vector3.dot(forward, eye);

    for(let i=0; i<3; i++) {
        lam[i][0] = right[i];
        lam[i][1] = trueUp[i];
        lam[i][2] = forward[i];
    }
    lam[3] = [translationX, translationY, translationZ, 1]

    return lam;
}

/**
 * Generates a perspective projection matrix.
 * i.e, makes the world have a perspective.
 * 
 * @param {number} fovy 
 * @param {number} aspect 
 * @param {number} near 
 * @param {number} far 
 * @returns {Mat4}
 */
export function perspective(fovy, aspect, near, far) {
    let p = new Mat4(0);

    let f  = 1.0 / Math.tan(fovy / 2.0);
    let nf = 1.0 / (near - far);

    p[0][0] = f / aspect;
    p[1][1] = f;
    p[2][2] = (far + near) * nf;
    p[2][3] = -1.0;
    p[3][2] = (2.0 * far * near) * nf;

    return p;
}