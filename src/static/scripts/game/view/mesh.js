export default class Mesh {
    gl;
    #VAO; #element_count;
    #has_indices;

    constructor(gl, vertices, indices = null) {
        this.gl = gl;
        this.#has_indices = indices !== null;

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

    #generateVAO(vertices, indices = null) {
        const FLOAT_SIZE = Float32Array.BYTES_PER_ELEMENT;

        const vao = this.gl.createVertexArray();
        this.gl.bindVertexArray(vao);

        const buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), this.gl.STATIC_DRAW);

        this.gl.enableVertexAttribArray(0);
        this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, 5 * FLOAT_SIZE, 0);

        this.gl.enableVertexAttribArray(1);
        this.gl.vertexAttribPointer(1, 2, this.gl.FLOAT, false, 5 * FLOAT_SIZE, 3 * FLOAT_SIZE);

        // EBO 
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