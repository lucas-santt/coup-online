/** @file 
 *  Animation curves, cheat sheet: https://easings.net
 */

import { Vector3 } from "./wglm-classes.js";
import { lerp, lerp3D } from "./wglm.js";

/**
 * Linear interpolation between two 3D vectors
 * 
 * @param {Vector3} start 
 * @param {Vector3} end 
 * @param {number} t Interpolation factor
 * @returns {Vector3}
 */
export function linearCurve(start, end, t) {
    if(start instanceof Vector3) return lerp3D(start, end, t);
    else return lerp(start, end, t);
}


function smoothstep(t) {
    const clampedT = Math.max(0, Math.min(1, t));
    return clampedT * clampedT * (3 - 2 * clampedT);
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
    if(start instanceof Vector3) return lerp3D(start, end, easedT);
    return lerp(start, end, easedT);
}


function easeOutBack(x, c = 1.7) {
    const c3 = c + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
}

export function easeOutBackCurve(start, end, t) {
    const easedT = easeOutBack(t);
    if(start instanceof Vector3) return lerp3D(start, end, easedT);
    else return lerp(start, end, easedT);
}


function easeOutQuint(x) {
    return 1 - Math.pow(1 - x, 5);
}

export function easeOutQuintCurve(start, end, t) {
    const easedT = easeOutQuint(t);
    if(start instanceof Vector3) return lerp3D(start, end, easedT);
    else return lerp(start, end, easedT);
}


function easeOutCirc(x) {
    return Math.sqrt(1 - Math.pow(x - 1, 2));
}

export function easeOutCircCurve(start, end, t) {
    const easedT = easeOutCirc(t);
    if(start instanceof Vector3) return lerp3D(start, end, easedT);
    else return lerp(start, end, easedT);
}


function easeInCirc(x) {
    return 1 - Math.sqrt(1 - Math.pow(x, 2));
}

export function easeInCircCurve(start, end, t) {
    const easedT = easeInCirc(t);
    if(start instanceof Vector3) return lerp3D(start, end, easedT);
    else return lerp(start, end, easedT);
}