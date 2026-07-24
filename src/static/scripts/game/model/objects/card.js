import { ANIM, OBJ } from '../../settings.js';
import { Vector3 } from '../../utils/wglm-classes.js';
import { easeInOutCurve, easeOutBackCurve, easeOutCircCurve, linearCurve } from '../../utils/wlgm-animation-curves.js';

import RenderableObject from '../../view/renderableObject.js';

export default class Card extends RenderableObject {
    typeIdx = 0;
    ogPos;

    #onAnimation = false;

    constructor(typeIdx, initPos, initRotation, initScale = OBJ.card.scale) {
        super("card", initPos, initRotation, initScale);
        this.typeIdx = typeIdx;
        this.ogPos = initPos.clone();
        this.ogRot = initRotation.clone();
    }

    update(dt) {
        super.update(dt);
    }

    onMouseEnter(point) {
        if(this.#onAnimation) return;

        this.animator.positionAnimation({
            to: Vector3.add(this.position, ANIM.hoverCard.positionOffset),
            ...ANIM.hoverCard.animSettings
        })
    }

    onMouseExit() {
        if(this.#onAnimation) return;

        this.animator.positionAnimation({to: this.ogPos, ...ANIM.hoverCard.animSettings});
    }

    // Animations
    async startExchangeAnim(otherCard) {
        const { 
            levitateAnim, 
            translateAnim, 
            levitateOffset 
        } = ANIM.exchangeCard;

        this.#onAnimation = true;
        const newPos = otherCard.ogPos.clone();
        const newRot = otherCard.ogRot.clone();

        // First Levitation
        await Promise.all([
            this.animator.positionAnimation({
                to: Vector3.add(this.ogPos, levitateOffset),
                ...levitateAnim
            }),
            this.animator.rotationAnimation({
                to: new Vector3(90, this.rotation.y, 0),
                ...levitateAnim
            })
        ]);

        // Translation
        await Promise.all([
            this.animator.positionAnimation({
                to: Vector3.add(newPos, levitateOffset),
                ...translateAnim
            }),
            this.animator.rotationAnimation({
                to: new Vector3(90, newRot.y, 0),
                ...translateAnim
            })
        ]);

        // Second Levitation (falling into the hand)
        await Promise.all([
            this.animator.positionAnimation({
                to: newPos,
                ...levitateAnim
            }),
            this.animator.rotationAnimation({
                to: newRot,
                ...levitateAnim
            })
        ]);

        this.ogPos = newPos;
        this.ogRot = newRot;
        this.#onAnimation = false;
    }

    async startShowingAnim(playerID) {
        const { showCard } = ANIM;
        this.#onAnimation = true;

        const showPos = Vector3.add(this.ogPos, showCard.card.posOffset);
        let showRot = Vector3.add(this.ogRot, showCard.card.rotOffset);
        // Player will not be affected by it's own rotation
        if(playerID == 0) showRot = new Vector3(0.0, 180.0, 0.0);

        await this.animator.positionAnimation({to: showPos, ...showCard.card.translation});
        await this.animator.rotationAnimation({to: showRot, ...showCard.card.rotation});

        // To stop the animation, needs to call another animation function
    }

    async stopShowingAnim() {
        // Returning to hand
        const { showCard } = ANIM;
        this.#onAnimation = true;

        await this.animator.rotationAnimation({to: this.ogRot, ...showCard.card.rotation});
        await this.animator.positionAnimation({to: this.ogPos, ...showCard.card.inverseTranslation});

        this.#onAnimation = false;
    }
}