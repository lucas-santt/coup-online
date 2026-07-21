import Shader from './shader.js'
import ImageLoader from './imageLoader.js';
import Renderer from './renderer.js';

export default class Material {
    shader; texture; textureTarget;

    constructor(vertexSource, fragmentSource, texturePaths = null) {
        const gl = Renderer.gl;
        this.shader = new Shader(vertexSource, fragmentSource);
        if(texturePaths) this.#generateTexture(gl, texturePaths);
    }

    bind(projection = null, view = null) {
        this.shader.use();

        if(projection) this.shader.setMat4("projection", projection);
        if(view) this.shader.setMat4("view", view);

        if(this.texture) {
            const gl = Renderer.gl;
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(this.textureTarget, this.texture);
            this.shader.setInt("uTextureMap", 0);
        }
    }

    async #generateTexture(gl, imagePaths) {
        // Placeholder texture while loading image
        const placeholderData =  [];
        for(let i=0; i<imagePaths.length; i++)
            placeholderData.push({width: 1, height: 1, data: new Uint8Array([0, 0, 0, 0])});
        this.#bindTex(gl, placeholderData);
        
        const images = await ImageLoader.loadImages(imagePaths);
        
        this.#bindTex(gl, images);
    }

    #bindTex(gl, images) {
        if(this.texture) gl.deleteTexture(this.texture);

        // Bind texture based on it's dimension
        if(images.length === 1) {
            this.textureTarget = gl.TEXTURE_2D;
            this.texture = this.#bind2DTex(gl, images[0]);
        } else {
            this.textureTarget = gl.TEXTURE_2D_ARRAY;
            this.texture = this.#bind3DTex(gl, images);
        }

        // Set mipmap settings and generates it
        gl.texParameteri(this.textureTarget, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(this.textureTarget, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.generateMipmap(this.textureTarget);
    }

    #bind2DTex(gl, img) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);

        const sourceData = img.data ? img.data : img;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, img.width, img.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, sourceData);
        
        return tex;
    }

    #bind3DTex(gl, images3D) {
        const width  = images3D[0].width;
        const height = images3D[0].height;
        const mipmapLevels = Math.floor(Math.log2(Math.max(width, height))) + 1;

        const tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);

        // Stores space for the full image and then, for each level, stores the source image
        gl.texStorage3D(gl.TEXTURE_2D_ARRAY, mipmapLevels, gl.RGBA8, width, height, images3D.length);
        images3D.forEach((img, index) => {
            const sourceImg = img.data ? img.data : img;
            gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, index, width, height, 1, gl.RGBA, gl.UNSIGNED_BYTE, sourceImg);
        });

        return tex;
    }
}