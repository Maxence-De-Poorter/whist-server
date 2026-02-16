const { SUITS, VALUES } = require('./constants');

function normalizeRoomId(roomId) {
    if (typeof roomId !== 'string') return null;
    const v = roomId.trim().toUpperCase();
    if (!v || v.length > 12) return null;
    return v;
}

function isValidCard(card) {
    return !!card &&
        typeof card === 'object' &&
        SUITS.includes(card.suit) &&
        VALUES.includes(card.value);
}

function isValidBid(bid, nbCards) {
    return typeof bid === 'number' &&
        Number.isInteger(bid) &&
        bid >= 0 &&
        bid <= nbCards;
}

module.exports = {
    normalizeRoomId,
    isValidCard,
    isValidBid
};
