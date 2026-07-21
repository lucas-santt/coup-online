import { Vector3, Mat4, Ray } from '../utils/wglm-classes.js'
import * as wglm from '../utils/wglm.js'

import Animator from './animation.js';
import AssetManager from './assetManager.js';

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
    animator;
    
    #position; #rotation; #scale;
    #mesh; #material;
    #isDirty = true; #cachedModelMatrix = null;

    constructor(name, initPos, initRotation, initScale) {
        this.#position = this.#bindVector(initPos);
        this.#scale    = this.#bindVector(initScale);
        this.#rotation = this.#bindVector(initRotation);
        
        const [ mesh, material ] = AssetManager.getAssets(name);
        this.#mesh = mesh;
        this.#material = material;

        this.animator = new Animator(this);
    }
    
    get position()  { return this.#position };
    set position(v) { this.#position = this.#bindVector(v); this.#isDirty = true; }

    get scale()  { return this.#scale };
    set scale(v) { this.#scale = this.#bindVector(v); this.#isDirty = true; }

    get rotation()  { return this.#rotation };
    set rotation(v) { this.#rotation = this.#bindVector(v); this.#isDirty = true; }

    update(dt) {
        this.animator.update(dt);
    }

    draw() {
        this.#material.shader.setMat4("model", this.#getModelTransform());
        this.#mesh.draw();
    }
    
    /**
     * Check if an ray intersects this object
     *
     * @param {Ray} worldRay 
     * @returns {Vector3|null} 
     */
    intersectRay(worldRay) {
        const modelMatrix = this.#getModelTransform({ scalable: false, flattened: false});
        const worldToLocalMatrix = Mat4.invertModelMatrix(modelMatrix);

        const unscaledO = Mat4.multVector3(worldToLocalMatrix, worldRay.origin, 1.0);
        const unscaledD = Mat4.multVector3(worldToLocalMatrix, worldRay.direction, 0.0);

        const origin = new Vector3(
            unscaledO.x / this.#scale.x,
            unscaledO.y / this.#scale.y,
            unscaledO.z / this.#scale.z
        )
        const direction = new Vector3(
            unscaledD.x / this.#scale.x,
            unscaledD.y / this.#scale.y,
            unscaledD.z / this.#scale.z
        )

        const ray = new Ray(origin, direction);
        const localHit = this.#mesh.intersectRay(ray);

        if(!localHit) return null;

        // Return the point into worldCoordinates
        return Mat4.multVector3(modelMatrix, localHit, 1.0);
    }

    onMouseEnter(point) { }
    onMouseExit() { }

    /**
     * Generates the model transform matrix, wich is
     *  the transformation matrix that applies a rotation,
     *  scale and translation of each object's point
     *
     * @returns {Float32Array} 
     */
    #getModelTransform(config = {}) {
        const { scalable = true, flattened = true } = config;

        if(!this.#isDirty && scalable) {
            if(flattened) return this.#cachedModelMatrix.flatten();
            else return this.#cachedModelMatrix;
        } 

        let scale = this.#scale;
        if(!scalable) scale = new Vector3(1.0, 1.0, 1.0);

        const mat = new Mat4(0);

        const rx = wglm.radians(this.#rotation.x);
        const ry = wglm.radians(this.#rotation.y);
        const rz = wglm.radians(this.#rotation.z);

        const cx = Math.cos(rx);
        const sx = Math.sin(rx);
        
        const cy = Math.cos(ry);
        const sy = Math.sin(ry);

        const cz = Math.cos(rz);
        const sz = Math.sin(rz);

        mat[0][0] = (cy * cz) * scale.x;
        mat[0][1] = (cy * sz) * scale.x;
        mat[0][2] = (-sy) * scale.x;

        mat[1][0] = (sx * sy * cz - cx * sz) * scale.y;
        mat[1][1] = (sx * sy * sz + cx * cz) * scale.y;
        mat[1][2] = (sx * cy) * scale.y;

        mat[2][0] = (cx * sy * cz + sx * sz) * scale.z;
        mat[2][1] = (cx * sy * sz - sx * cz) * scale.z;
        mat[2][2] = (cx * cy) * scale.z;

        mat[3][0] = this.#position.x;
        mat[3][1] = this.#position.y;
        mat[3][2] = this.#position.z;
        mat[3][3] = 1;

        if(scalable) {
            this.#cachedModelMatrix = mat;
            this.#isDirty = false;
        }

        if(flattened) return mat.flatten();
        else return mat;
    }

    /**
     * Bind a callback function to a vector.
     *  The callback function make the object dirty
     *  if any of the vector properties (x,y,z) are altered
     *
     * Needed only for position, scale and rotation vectors
     * 
     * @param {Vector3} v 
     * @returns {Vector3} 
     */
    #bindVector(v) {
        v.onChangeCallback = () => { this.#isDirty = true; };
        return v; 
    }
}