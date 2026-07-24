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

    exchangeCard(cardID, otherPlayer, otherPlayerCardID) {
        const newCard = otherPlayer.cards[otherPlayerCardID];
        const cardExchanged = this.cards[cardID];

        this.cards[cardID] = newCard;
        otherPlayer.cards[otherPlayerCardID] = cardExchanged;

        newCard.startExchangeAnim(cardExchanged);
        cardExchanged.startExchangeAnim(newCard);
    }
}