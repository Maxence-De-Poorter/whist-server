const { SUITS, VALUES } = require('./constants');

/**
 * Normalise et valide un Room ID
 * - max 12 caractères
 * - alphanumérique uniquement
 */
function normalizeRoomId(roomId) {
    if (typeof roomId !== 'string') return null;

    const value = roomId.trim().toUpperCase();

    if (!value) return null;
    if (value.length > 12) return null;

    // Autoriser uniquement lettres + chiffres
    if (!/^[A-Z0-9]+$/.test(value)) return null;

    return value;
}

/**
 * Vérifie qu'une carte est valide
 */
function isValidCard(card) {
    if (!card || typeof card !== 'object') return false;

    if (typeof card.suit !== 'string') return false;
    if (typeof card.value !== 'string') return false;

    if (!SUITS.includes(card.suit)) return false;
    if (!VALUES.includes(card.value)) return false;

    return true;
}

/**
 * Vérifie qu'un pari est valide
 */
function isValidBid(bid, nbCards) {
    if (!Number.isInteger(nbCards) || nbCards < 0) return false;

    return (
        Number.isInteger(bid) &&
        bid >= 0 &&
        bid <= nbCards
    );
}

module.exports = {
    normalizeRoomId,
    isValidCard,
    isValidBid
};
