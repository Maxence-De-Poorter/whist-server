const Engine = require('../gameEngine');

describe('GameEngine - getCardsCount', () => {

    test('Round 1 should give 1 card', () => {
        expect(Engine.getCardsCount(1)).toBe(1);
    });

    test('Round 8 should give 8 cards', () => {
        expect(Engine.getCardsCount(8)).toBe(8);
    });

    test('Round 9 should give 8 cards', () => {
        expect(Engine.getCardsCount(9)).toBe(8);
    });

    test('Round 18 should give 1 card', () => {
        expect(Engine.getCardsCount(18)).toBe(1);
    });

});

describe('GameEngine - calculatePoints', () => {

    test('Exact bid gives bonus + trick points', () => {
        const points = Engine.calculatePoints(3, 3);
        expect(points).toBe(10 + (3 * 2));
    });

    test('Missed bid gives negative penalty', () => {
        const points = Engine.calculatePoints(3, 1);
        expect(points).toBe(-4); // diff 2 × 2
    });

});

describe('GameEngine - evaluateTrick', () => {

    test('Higher card of lead suit wins', () => {
        const table = [
            { card: { suit: '♥', value: '9' }, playerId: 1 },
            { card: { suit: '♥', value: 'A' }, playerId: 2 }
        ];

        const winner = Engine.evaluateTrick(table, null);
        expect(winner.playerId).toBe(2);
    });

    test('Trump beats lead suit', () => {
        const table = [
            { card: { suit: '♥', value: 'A' }, playerId: 1 },
            { card: { suit: '♠', value: '7' }, playerId: 2 }
        ];

        const winner = Engine.evaluateTrick(table, '♠');
        expect(winner.playerId).toBe(2);
    });

});

test('evaluateTrick returns null on empty table', () => {
    expect(Engine.evaluateTrick([], null)).toBe(null);
});

test('Without trump, lead suit wins even if other suit higher', () => {
    const table = [
        { card: { suit: '♥', value: '9' }, playerId: 1 },
        { card: { suit: '♠', value: 'A' }, playerId: 2 }
    ];

    const winner = Engine.evaluateTrick(table, null);
    expect(winner.playerId).toBe(1);
});

test('isMoveLegal allows free play if no lead suit and no trump', () => {
    const hand = [{ suit: '♠', value: '7' }];
    const table = [{ card: { suit: '♥', value: '9' } }];

    const result = Engine.isMoveLegal(hand, { suit: '♠', value: '7' }, table, null);
    expect(result).toBe(true);
});

describe('GameEngine - createDeck', () => {

    test('Deck contains 32 unique cards', () => {
        const deck = Engine.createDeck();

        expect(deck.length).toBe(32);

        const unique = new Set(deck.map(c => `${c.suit}-${c.value}`));
        expect(unique.size).toBe(32);
    });

});
