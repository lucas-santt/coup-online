/**
 *  @file Utility model for essencial math functions
 * 
  */
import { Mat4, Vector3 } from "./wglm-classes.js"

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

export function normalize(v) {
    let mag = v.mag();
    if(mag==0) return new Vector3(0.0, 0.0, 0.0);

    return new Vector3(v.x/mag, v.y/mag, v.z/mag);
}

export function dot(a, b) {
    return (a.x * b.x) + (a.y * b.y) + (a.z * b.z);
}

/**
 * Cross product between two vectors a and b
 * 
 * @param {Vector3} a 
 * @param {Vector3} b 
 * @returns {Vector3}
 */
export function cross(a, b) {
    return new Vector3(a.y*b.z - a.z*b.y, a.z*b.x - a.x*b.z, a.x*b.y - a.y*b.x);
}

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

    let forward = normalize(Vector3.subtract(eye, center));
    let right   = normalize(cross(up, forward));
    let trueUp  = cross(forward, right);

    let translationX = -dot(right, eye);
    let translationY = -dot(trueUp, eye);
    let translationZ = -dot(forward, eye);

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