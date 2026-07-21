import { GEOMETRY, ASSETS } from "../settings.js";
import Material from "./material.js";
import Mesh from "./mesh.js";


/**
 * Manages every asset with support for
 *  resource sharing. An asset is either an
 *  object's mesh or material.
 *
 * @export
 * @class AssetManager
 * @typedef {AssetManager}
 */
export default class AssetManager {
    static #meshes = new Map();
    static #materials = new Map();

    static addMesh(name, vertices, indices) {
        if(this.#meshes.has(name)) return;

        const mesh = new Mesh(vertices, indices);
        this.#meshes.set(name, mesh);
    }

    static getMesh(name) {
        if(!this.#meshes.has(name)) return null;
        return this.#meshes.get(name);
    }

    static addMaterial(name, vertexShader, fragmentShader, textures) {
        if(this.#materials.has(name)) return;

        const material = new Material(vertexShader, fragmentShader, textures);
        this.#materials.set(name, material);
    }

    static getMaterial(name){
        if(!this.#materials.has(name)) return null;
        return this.#materials.get(name);
    }

    static getAssets(name) {
        return [this.getMesh(name), this.getMaterial(name)];
    }

    
    /**
     * Loads every asset needed, declared in settings.js
     *
     * @static
     */
    static loadAssets() {
        for(const key in ASSETS) {
            const a = ASSETS[key];
            const g = GEOMETRY[key];

            this.addMesh(a.name, g.vertices, g.indices);
            this.addMaterial(a.name, a.vertexShader, a.fragmentShader, a.textures);
        }
    }

    /** 
     * Generates circle vertices, indices and uv coordinates
     * 
     * @private
     */
    static genCoinVertices() {
        GEOMETRY.coin.vertices = [];
        GEOMETRY.coin.indices = [];
        
        // Generating vertices and uv coordinates
        GEOMETRY.coin.vertices.push(0.0, 0.0, 0.0, 0.5, 0.5);
        for(let i=0; i< GEOMETRY.coin.resolution; i++) {
            const angle = (i/GEOMETRY.coin.resolution) * Math.PI * 2;

            const u = 0.5 + (Math.cos(angle) * 0.5);
            const v = 0.5 - (Math.sin(angle) * 0.5);

            GEOMETRY.coin.vertices.push(Math.cos(angle), Math.sin(angle), 0.0, u, v);
        };

        // Generating indices
        for(let i=1; i <= GEOMETRY.coin.resolution; i++) {
            const nexVert = (i==GEOMETRY.coin.resolution) ? 1 : i + 1;
            GEOMETRY.coin.indices.push(0, i, nexVert);
        };
    }
}