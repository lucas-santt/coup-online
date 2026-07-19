import { linearCurve } from "../utils/wlgm-animation-curves.js";

export default class Animator {
    #object; #animations;

    constructor(renderableObject) {
        this.#object = renderableObject;
        this.#animations = {};
    }

    update(dt) {
        for(let key in this.#animations) {
            if(this.#animations[key])
                this.#animations[key].update(dt);
        }
    }

    positionAnimation(config) {
        this.#addAnimation("position", this.#object.position, config);   
    }

    rotationAnimation(config) {
        this.#addAnimation("rotation", this.#object.rotation, config);
    }

    scaleAnimation(config) {
        this.#addAnimation("scale", this.#object.scale, config);
    }

    #addAnimation(name, target, config) {
        this.#animations[name] = new Animation(target, config);
    }
}

export class Animation {
    #fullAnimTime; #currAnimTime; #timer;
    #target; #from; #to;
    #animationCurve;
    #active;

    constructor(target, config) {
        const { 
            animTime,
            from = null, 
            to, 
            startInstantly = true, 
            animationCurve = linearCurve
        } = config;
        
        this.#fullAnimTime = animTime;
        this.#target = target;
        this.#from = from ? from : target.clone();
        this.#to = to;
        this.#animationCurve = animationCurve;

        if (startInstantly) this.start();
        else this.#active = false;
    }

    update(dt) {
        if(!this.#active) return;

        this.#timer += dt;
        const percentage = Math.min(this.#timer / this.#currAnimTime, 1.0);
        
        const currValue = this.#animationCurve(this.#from, this.#to, percentage);
        this.#target.copy(currValue);
        
        if(percentage === 1.0) this.stop();
    }

    pause() {
        this.#active = false;
    }

    resume() {
        this.#active = true;
    }

    stop() {
        this.#timer = 0;
        this.#active = false;
    }

    start() {
        this.#currAnimTime = this.#fullAnimTime;
        this.#timer = 0;
        this.#active = true;
    }

    changeAnimationTime(newAnimTime) {
        this.#fullAnimTime = newAnimTime;

        if(this.#active) {
            const progress = this.#timer / this.#currAnimTime;
            this.#currAnimTime = newAnimTime;
            this.#timer = progress * this.#currAnimTime;
        }
    }
}