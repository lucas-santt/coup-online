import { Vector3 } from "../utils/wglm-classes.js";
import Renderer from "./renderer.js";

export default class Mesh {
    #VAO; #element_count; #has_indices;
    #vertices; #indices;

    constructor(vertices, indices) {
        this.#has_indices = indices !== null;
        this.#vertices = vertices;
        this.#indices = indices;

        if(this.#has_indices) this.#element_count = indices.length;
        else this.#element_count = vertices.length / 5;

        this.#VAO = this.#generateVAO(vertices, indices);
    }

    draw() {
        const gl = Renderer.gl;
        gl.bindVertexArray(this.#VAO);
        
        if(this.#has_indices) 
            gl.drawElements(gl.TRIANGLES, this.#element_count, gl.UNSIGNED_SHORT, 0)
        else
            gl.drawArrays(gl.TRIANGLES, 0, this.#element_count);
        
        gl.bindVertexArray(null);
    }

    intersectRay(ray) {
        let closestHit = null;
        let minT = Infinity;

        const stride = 5;

        const getVertex = (index) => {
            index *= stride;
            return new Vector3(
                this.#vertices[index],
                this.#vertices[index+1],
                this.#vertices[index+2]
            );
        };

        const checkTriangle = (i0, i1, i2) => {
            const v0 = getVertex(i0);
            const v1 = getVertex(i1);
            const v2 = getVertex(i2);
            
            const hit = this.checkRayTriangleCollision(ray, v0, v1, v2);
            if(hit && hit < minT) {
                closestHit = ray.point(hit);
                minT = hit;
            }
        };

        for(let i=0; i<this.#element_count; i+=3){
            if(!this.#has_indices) checkTriangle(i, i+1, i+2);
            else checkTriangle(this.#indices[i], this.#indices[i+1], this.#indices[i+2]);
        }

        return closestHit;
    }
    
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
    checkRayTriangleCollision(ray, v1, v2, v3) {
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

    /**
     * Generates the vertices array object and its associated buffer
     * 
     * @private
     * @param {number[]} vertices 
     * @param {numer[]|null} indices 
     * @returns {WebGLVertexArrayObject}
     */
    #generateVAO(vertices, indices = null) {
        const FLOAT_SIZE = Float32Array.BYTES_PER_ELEMENT;
        const gl = Renderer.gl;

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        // Bind VBO buffer and vertices to it
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

        // Properties (Vertices and UV coordinates)
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 5 * FLOAT_SIZE, 0);

        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 5 * FLOAT_SIZE, 3 * FLOAT_SIZE);

        // Bind EBO buffer and bind indices to it
        if(this.#has_indices) {
            const indexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
            gl.bufferData(
                gl.ELEMENT_ARRAY_BUFFER, 
                new Uint16Array(indices), 
                gl.STATIC_DRAW)
        }

        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        if(this.#has_indices) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

        return vao;
    }
}