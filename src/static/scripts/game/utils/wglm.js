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

export function lerp3D(start, end, t) {
    return new Vector3(
        lerp(start.x, end.x, t),
        lerp(start.y, end.y, t),
        lerp(start.z, end.z, t)
    )
}

export function radians(degreesAngle) {
    return degreesAngle * (Math.PI / 180.0);
}

export function degrees(radiansAngle) {
    return radiansAngle * (180.0/Math.PI);
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

export function distanceSquared(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = p1.z - p2.z;
    return (dx * dx) + (dy * dy) + (dz * dz);
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

// ------------- Algorithms -------------

/**
 * Möller-Trumbore intersection algorithm.
 * Checks if there any intersection point
 *  of a ray into a triangle with vertices
 *  v1, v2 and v3
 *
 * @param {Ray} ray 
 * @param {Vector3} v1 
 * @param {Vector3} v2 
 * @param {Vector3} v3 
 * @returns {Number|null} 
 */
export function checkRayTriangleCollision(ray, v1, v2, v3) {
    const EPSILON = 1e-6;
    
    const edge1 = Vector3.subtract(v2, v1);
    const edge2 = Vector3.subtract(v3, v1);
    const solution = Vector3.subtract(ray.origin, v1);

    const DCrossE2 = Vector3.cross(ray.direction, edge2);

    const det = Vector3.dot(edge1, DCrossE2);
    if(Math.abs(det) < EPSILON) return null ; // Ray is parallel to plane

    const inv_det = 1.0 / det;
    const detU = Vector3.dot(solution, DCrossE2);
    const u = inv_det * detU;

    if(u < -EPSILON || u-1 > EPSILON) return null; // Ray passes outside edge2

    const SCrossE1 = Vector3.cross(solution, edge1);
    const detV = Vector3.dot(ray.direction, SCrossE1);
    const v = inv_det * detV;

    if(v < -EPSILON || u+v-1 > EPSILON) return null; // Ray passes outside edge1
    // Ray intersects!
    const t = inv_det * Vector3.dot(edge2, SCrossE1);

    if(t > EPSILON)
        return t; 
    else
        return null; // Line intersection but not ray intersection
}