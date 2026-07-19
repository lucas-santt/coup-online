import { Vector3 } from "./wglm-classes.js";
import { lerp, smoothstep } from "./wglm.js";

/**
 * Linear interpolation between two 3D vectors
 * 
 * @param {Vector3} start 
 * @param {Vector3} end 
 * @param {number} t Interpolation factor
 * @returns {Vector3}
 */
export function linearCurve(start, end, t) {
    return new Vector3(
        lerp(start.x, end.x, t),
        lerp(start.y, end.y, t),
        lerp(start.z, end.z, t)
    )
}

/**
 * Interporlation between two 3D vectors
 *  with Ease-In and Ease-Out
 *
 * @export
 * @param {Vector3} start 
 * @param {Vector3} end 
 * @param {number} t 
 * @returns {Vector3} 
 */
export function easeInOutCurve(start, end, t) {
    const easedT = smoothstep(t);

    return new Vector3(
        lerp(start.x, end.x, easedT),
        lerp(start.y, end.y, easedT),
        lerp(start.z, end.z, easedT)
    );
}