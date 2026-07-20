import { Vector3, Mat4 } from '../../utils/wglm-classes.js'
import * as wglm from '../../utils/wglm.js'

import Animator from '../animation.js';

/**
 * Scene Object that need to be rendered.
 * Responsable for the heavy rendering math, absorving it
 *  instead of being thrown at each object script
 * Needs to be inherited for each object that will be rendered 
 *
 * @export
 * @class RenderableObject
 * @typedef {RenderableObject}
 */
export default class RenderableObject {
    position; rotation; scale;
    animator;

    constructor(initPos, initRotation, initScale) {
        this.position = initPos;
        this.scale = initScale;
        this.rotation = initRotation || new Vector3(0, 0, 0);
        
        this.animator = new Animator(this);
    }

    update(dt) {
        this.animator.update(dt);
    }
    
    /**
     * Generates the model transform matrix, wich is
     *  the transformation matrix that applies a rotation,
     *  scale and translation of each object's point
     *
     * @returns {Float32Array} 
     */
    getModelTransform() {
        const mat = new Mat4(0);

        const rx = wglm.radians(this.rotation.x);
        const ry = wglm.radians(this.rotation.y);
        const rz = wglm.radians(this.rotation.z);

        const cx = Math.cos(rx);
        const sx = Math.sin(rx);
        
        const cy = Math.cos(ry);
        const sy = Math.sin(ry);

        const cz = Math.cos(rz);
        const sz = Math.sin(rz);

        mat[0][0] = (cy * cz) * this.scale.x;
        mat[0][1] = (cy * sz) * this.scale.x;
        mat[0][2] = (-sy) * this.scale.x;

        mat[1][0] = (sx * sy * cz - cx * sz) * this.scale.y;
        mat[1][1] = (sx * sy * sz + cx * cz) * this.scale.y;
        mat[1][2] = (sx * cy) * this.scale.y;

        mat[2][0] = (cx * sy * cz + sx * sz) * this.scale.z;
        mat[2][1] = (cx * sy * sz - sx * cz) * this.scale.z;
        mat[2][2] = (cx * cy) * this.scale.z;

        mat[3][0] = this.position.x;
        mat[3][1] = this.position.y;
        mat[3][2] = this.position.z;
        mat[3][3] = 1;

        return mat.flatten();
    }
}