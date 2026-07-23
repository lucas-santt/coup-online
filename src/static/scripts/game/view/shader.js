import Renderer from "./renderer.js";

export default class Shader {
    ID;

    constructor(vertexSrc, fragmentSrc) {
        const gl = Renderer.gl;
        const vertexShader   = this.#createShader(gl.VERTEX_SHADER, vertexSrc);
        const fragmentShader = this.#createShader(gl.FRAGMENT_SHADER, fragmentSrc);
        
        // Create shader program and link the vertex and fragments shaders
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        // Check for any linking error
        if(!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error(gl.getProgramInfoLog(program));
        }

        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        this.ID = program;
    }

    use() {
        Renderer.gl.useProgram(this.ID);
    }

    setBool(name, value) {
        Renderer.gl.uniform1i(Renderer.gl.getUniformLocation(this.ID, name), value ? 1 : 0);
    }

    setInt(name, value) {
        Renderer.gl.uniform1i(Renderer.gl.getUniformLocation(this.ID, name), value);
    }

    setFloat(name, value) {
        Renderer.gl.uniform1f(Renderer.gl.getUniformLocation(this.ID, name), value);
    }

    setMat4(name, matrix) {
        Renderer.gl.uniformMatrix4fv(Renderer.gl.getUniformLocation(this.ID, name), false, matrix);
    }

    #createShader(type, src) {
        const gl = Renderer.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, src);
        gl.compileShader(shader);

        // Check for any compiling error
        if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }
}