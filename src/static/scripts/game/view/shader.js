export default class Shader {
    gl; ID;

    constructor(gl, vertexSrc, fragmentSrc) {
        this.gl = gl;

        const vertexShader   = this.#createShader(gl.VERTEX_SHADER, vertexSrc);
        const fragmentShader = this.#createShader(gl.FRAGMENT_SHADER, fragmentSrc);
        
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if(!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error(gl.getProgramInfoLog(program));
        }

        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        this.ID = program;
    }

    use() {
        this.gl.useProgram(this.ID);
    }

    setBool(name, value) {
        this.gl.uniform1i(this.gl.getUniformLocation(this.ID, name), value ? 1 : 0);
    }

    setInt(name, value) {
        this.gl.uniform1i(this.gl.getUniformLocation(this.ID, name), value);
    }

    setFloat(name, value) {
        this.gl.uniform1f(this.gl.getUniformLocation(this.ID, name), value);
    }

    setMat4(name, matrix) {
        this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.ID, name), false, matrix);
    }

    #createShader(type, src) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, src);
        this.gl.compileShader(shader);

        if(!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error(this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }

        return shader;
    }
}