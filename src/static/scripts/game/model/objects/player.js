export default class Player {
    id; cards; coinStack;

    constructor(id, coinStack, frontCard, backCard) {
        this.id = id;
        this.cards = [frontCard, backCard];
        this.coinStack = coinStack;
    }

    update(dt) {
        this.coinStack.update(dt);
        this.cards.forEach(card => card.update(dt));
    }
}