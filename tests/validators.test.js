const { normalizeRoomId, isValidCard, isValidBid } = require('../validators');

describe('Validators', () => {

    test('normalizeRoomId trims and uppercases', () => {
        expect(normalizeRoomId(' test ')).toBe('TEST');
    });

    test('normalizeRoomId rejects invalid', () => {
        expect(normalizeRoomId(null)).toBe(null);
        expect(normalizeRoomId('')).toBe(null);
    });

    test('isValidCard accepts valid card', () => {
        expect(isValidCard({ suit: '♥', value: '7' })).toBe(true);
    });

    test('isValidCard rejects invalid card', () => {
        expect(isValidCard({ suit: 'X', value: '7' })).toBe(false);
        expect(isValidCard(null)).toBe(false);
    });

    test('isValidBid works correctly', () => {
        expect(isValidBid(2, 5)).toBe(true);
        expect(isValidBid(-1, 5)).toBe(false);
        expect(isValidBid(6, 5)).toBe(false);
    });

});
