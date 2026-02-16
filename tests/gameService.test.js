const GameService = require('../gameService');
const Engine = require('../gameEngine');

function createMockRoom() {
    return {
        id: "TEST",
        players: [
            { id: "1", userId: "u1", name: "P1", hand: [], bid: null, tricksWon: 0, score: 0 },
            { id: "2", userId: "u2", name: "P2", hand: [], bid: null, tricksWon: 0, score: 0 },
            { id: "3", userId: "u3", name: "P3", hand: [], bid: null, tricksWon: 0, score: 0 },
            { id: "4", userId: "u4", name: "P4", hand: [], bid: null, tricksWon: 0, score: 0 }
        ],
        gameState: {
            currentRound: 1,
            dealerIndex: 0,
            currentPlayerIndex: 0,
            status: 'PLAYING',
            trump: null,
            table: [],
            scoreHistory: []
        }
    };
}

describe('GameService - playCard basic flow', () => {

    test('Player can play valid card', () => {
        const room = createMockRoom();

        room.players[0].hand = [{ suit: '♥', value: '7' }];

        const res = GameService.playCard(
            room,
            "1",
            { suit: '♥', value: '7' }
        );

        expect(res.ok).toBe(true);
        expect(room.gameState.table.length).toBe(1);
        expect(room.players[0].hand.length).toBe(0);
    });

});

describe('GameService - finishRound', () => {

    test('Finish round updates scores', () => {
        const room = createMockRoom();

        room.gameState.currentRound = 1;

        room.players.forEach(p => {
            p.bid = 1;
            p.tricksWon = 1;
        });

        const res = GameService.finishRound(room);

        expect(room.players[0].score).toBe(12);
        expect(room.gameState.scoreHistory.length).toBe(1);
        expect(res.nextRound).toBe(true);
    });

});

describe('GameService - illegal turn', () => {

    test('Player cannot play if not his turn', () => {
        const room = createMockRoom();

        room.players[0].hand = [{ suit: '♥', value: '7' }];
        room.gameState.currentPlayerIndex = 1; // Ce n'est pas son tour

        const res = GameService.playCard(
            room,
            "1",
            { suit: '♥', value: '7' }
        );

        expect(res.ok).toBe(false);
        expect(room.gameState.table.length).toBe(0);
    });

});

describe('GameService - invalid card ownership', () => {

    test('Player cannot play card he does not have', () => {
        const room = createMockRoom();

        room.players[0].hand = [{ suit: '♥', value: '7' }];

        const res = GameService.playCard(
            room,
            "1",
            { suit: '♥', value: 'A' } // Il ne l'a pas
        );

        expect(res.ok).toBe(false);
        expect(room.gameState.table.length).toBe(0);
    });

});

describe('GameService - must follow suit', () => {

    test('Player must follow suit if possible', () => {
        const room = createMockRoom();

        room.players[0].hand = [
            { suit: '♥', value: '7' },
            { suit: '♠', value: 'A' }
        ];

        room.players[1].hand = [
            { suit: '♥', value: '8' }
        ];

        // P1 joue ♥
        GameService.playCard(room, "1", { suit: '♥', value: '7' });

        // P2 tente de jouer ♠ alors qu'il a ♥
        const res = GameService.playCard(
            room,
            "2",
            { suit: '♠', value: 'A' }
        );

        expect(res.ok).toBe(false);
        expect(room.gameState.table.length).toBe(1);
    });

});

describe('GameService - must trump if no lead suit', () => {

    test('Player must play trump if he has no lead suit but has trump', () => {
        const room = createMockRoom();

        room.gameState.trump = { suit: '♠', value: '7' };

        room.players[0].hand = [
            { suit: '♥', value: '7' }
        ];

        room.players[1].hand = [
            { suit: '♠', value: 'A' }, // atout
            { suit: '♦', value: '8' }
        ];

        // P1 joue ♥
        GameService.playCard(room, "1", { suit: '♥', value: '7' });

        // P2 tente de jouer ♦ alors qu'il doit couper
        const res = GameService.playCard(
            room,
            "2",
            { suit: '♦', value: '8' }
        );

        expect(res.ok).toBe(false);
        expect(room.gameState.table.length).toBe(1);
    });

});

describe('GameEngine - trump priority', () => {

    test('Trump hierarchy respected', () => {
        const table = [
            { card: { suit: '♠', value: '9' }, playerId: 1 },
            { card: { suit: '♠', value: 'V' }, playerId: 2 }
        ];

        const winner = Engine.evaluateTrick(table, '♠');

        expect(winner.playerId).toBe(2); // Valet > 9
    });

});
describe('GameService - bidding transition', () => {

    test('Game switches to PLAYING when all bids placed', () => {
        const room = createMockRoom();

        room.gameState.status = 'BIDDING';

        room.players.forEach((p, index) => {
            p.id = String(index + 1);
        });

        // Tour de chaque joueur
        GameService.placeBid(room, "1", 1);
        GameService.placeBid(room, "2", 1);
        GameService.placeBid(room, "3", 1);
        GameService.placeBid(room, "4", 1);

        expect(room.gameState.status).toBe('PLAYING');
    });

});

test('Cannot play if status not PLAYING', () => {
    const room = createMockRoom();
    room.gameState.status = 'BIDDING';

    const res = GameService.playCard(room, "1", { suit: '♥', value: '7' });
    expect(res.ok).toBe(false);
});

test('Cannot play if table already full', () => {
    const room = createMockRoom();
    room.players[0].hand = [{ suit: '♥', value: '7' }];

    room.gameState.table = [
        {}, {}, {}, {}
    ];

    const res = GameService.playCard(room, "1", { suit: '♥', value: '7' });
    expect(res.ok).toBe(false);
});

test('finishRound returns gameOver after round 18', () => {
    const room = createMockRoom();

    room.gameState.currentRound = 18;

    room.players.forEach(p => {
        p.bid = 1;
        p.tricksWon = 1;
    });

    const res = GameService.finishRound(room);

    expect(res.gameOver).toBe(true);
    expect(room.gameState.status).toBe('FINISHED');
});

describe('GameService - startNewRound', () => {

    test('startNewRound deals cards and sets BIDDING', () => {
        const room = createMockRoom();

        // Mock io
        const io = {
            to: () => ({
                emit: jest.fn()
            })
        };

        GameService.startNewRound(room, io);

        expect(room.gameState.status).toBe('BIDDING');

        room.players.forEach(p => {
            expect(p.hand.length).toBeGreaterThan(0);
            expect(p.bid).toBe(null);
            expect(p.tricksWon).toBe(0);
        });
    });

});

describe('GameService - invalid bid cases', () => {

    test('Cannot bid if not BIDDING state', () => {
        const room = createMockRoom();
        room.gameState.status = 'PLAYING';

        const res = GameService.placeBid(room, "1", 1);
        expect(res.ok).toBe(false);
    });

    test('Cannot bid if not player turn', () => {
        const room = createMockRoom();
        room.gameState.status = 'BIDDING';
        room.gameState.currentPlayerIndex = 1;

        const res = GameService.placeBid(room, "1", 1);
        expect(res.ok).toBe(false);
    });

});

describe('GameService - trick completion', () => {

    test('Returns trickCompleted when 4 cards played', () => {
        const room = createMockRoom();

        room.players.forEach((p, i) => {
            p.hand = [{ suit: '♥', value: String(7 + i) }];
        });

        room.gameState.trump = null;

        GameService.playCard(room, "1", room.players[0].hand[0]);
        GameService.playCard(room, "2", room.players[1].hand[0]);
        GameService.playCard(room, "3", room.players[2].hand[0]);
        const res = GameService.playCard(room, "4", room.players[3].hand[0]);

        expect(res.trickCompleted).toBe(true);
        expect(room.players.some(p => p.tricksWon === 1)).toBe(true);
    });

});
