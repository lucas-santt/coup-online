import { Vector3 } from "../utils/wglm-classes.js";

export default class Mesh {
    gl;
    
    #VAO; #element_count; #has_indices;
    #vertices; #indices;

    constructor(gl, vertices, indices = null) {
        this.gl = gl;
        this.#has_indices = indices !== null;
        this.#vertices = vertices;
        this.#indices = indices;

        if(this.#has_indices) this.#element_count = indices.length
        else this.#element_count = vertices.length / 5;

        this.#VAO = this.#generateVAO(vertices, indices);
    }

    draw() {
        this.gl.bindVertexArray(this.#VAO);
        
        if(this.#has_indices) 
            this.gl.drawElements(this.gl.TRIANGLES, this.#element_count, this.gl.UNSIGNED_SHORT, 0)
        else
            this.gl.drawArrays(this.gl.TRIANGLES, 0, this.#element_count);
        
        this.gl.bindVertexArray(null);
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

        const vao = this.gl.createVertexArray();
        this.gl.bindVertexArray(vao);

        // Bind VBO buffer and vertices to it
        const buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), this.gl.STATIC_DRAW);

        // Properties (Vertices and UV coordinates)
        this.gl.enableVertexAttribArray(0);
        this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, 5 * FLOAT_SIZE, 0);

        this.gl.enableVertexAttribArray(1);
        this.gl.vertexAttribPointer(1, 2, this.gl.FLOAT, false, 5 * FLOAT_SIZE, 3 * FLOAT_SIZE);

        // Bind EBO buffer and bind indices to it
        if(this.#has_indices) {
            const indexBuffer = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
            this.gl.bufferData(
                this.gl.ELEMENT_ARRAY_BUFFER, 
                new Uint16Array(indices), 
                this.gl.STATIC_DRAW)
        }

        this.gl.bindVertexArray(null);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        if(this.#has_indices) this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);

        return vao;
    }
}