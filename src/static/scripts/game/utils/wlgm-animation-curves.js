import { Vector3 } from "./wglm-classes.js";
import { lerp } from "./wglm.js";

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