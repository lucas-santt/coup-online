import Shader from './shader.js'
import ImageLoader from './imageLoader.js';

export default class Material {
    shader; texture;

    constructor(gl, vertexSource, fragmentSource, texturePaths = null) {
        this.shader = new Shader(gl, vertexSource, fragmentSource);
        if(texturePaths) this.#generateTexture(gl, texturePaths);
    }

    bind(gl = null) {
        this.shader.use();

        if(this.texture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);
            this.shader.setInt("uTextureMap", 0);
        }
    }

    async #generateTexture(gl, imagePaths) {
        const placeholderData =  [];
        for(let i=0; i<imagePaths.length; i++)
            placeholderData.push({width: 1, height: 1, data: new Uint8Array([0, 0, 0, 0])});
        this.texture = this.#bind3DTex(gl, placeholderData);
        
        const images = await ImageLoader.loadImages(imagePaths);
        const newTex = this.#bind3DTex(gl, images);

        if(this.texture) gl.deleteTexture(this.texture);
        this.texture = newTex;
    }

    #bind3DTex(gl, images3D) {
        const width  = images3D[0].width;
        const height = images3D[0].height;
        const mipmapLevels = Math.floor(Math.log2(Math.max(width, height))) + 1;

        const tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);

        gl.texStorage3D(gl.TEXTURE_2D_ARRAY, mipmapLevels, gl.RGBA8, width, height, images3D.length);
        images3D.forEach((img, index) => {
            const sourceImg = img.data ? img.data : img;
            gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, index, width, height, 1, gl.RGBA, gl.UNSIGNED_BYTE, sourceImg);
        });

        gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        return tex;
    }
}