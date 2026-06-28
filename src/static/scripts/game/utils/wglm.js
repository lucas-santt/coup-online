/*
    WebGL Mathematics
    Utility Math functions for 3D rendering in WebGL

    Created and maintained by the creators of this repository
*/

import { Mat4, Vector3 } from "./wglm-classes.js"

// Pure math

export function lerp(start, end, t) {
    return start + (end-start) * t;
}

export function lerpVector3(start, end, t) {
    return new Vector3(
        lerp(start.x, end.x, t),
        lerp(start.y, end.y, t),
        lerp(start.z, end.z, t)
    )
}

export function radians(degreesAngle) {
    return degreesAngle * (Math.PI / 180.0);
}

// Vector

export function normalize(v) {
    let mag = v.mag();
    if(mag==0) return new Vector3(0.0, 0.0, 0.0);

    return new Vector3(v.x/mag, v.y/mag, v.z/mag);
}

export function dot(a, b) {
    return (a.x * b.x) + (a.y * b.y) + (a.z * b.z);
}

export function cross(a, b) {
    /* Returns cross product between two vectors a and b */
    return new Vector3(a.y*b.z - a.z*b.y, a.z*b.x - a.x*b.z, a.x*b.y - a.y*b.x);
}

export function distance(p1, p2) {
    /* Returns distance between two points */
    return Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
}

// Transformation Matrices

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