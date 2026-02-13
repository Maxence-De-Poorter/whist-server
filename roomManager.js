class RoomManager {

    constructor() {
        this.rooms = new Map();
        this.socketToRoom = new Map();
    }

    getRoom(roomId) {
        if (!roomId) return null;
        return this.rooms.get(roomId.toUpperCase()) || null;
    }

    createOrJoin(roomId, socket, user) {

        if (!roomId || !user?.userId || !user?.pseudo) {
            return { error: "Paramètres invalides." };
        }

        roomId = roomId.toUpperCase().trim();

        let room = this.rooms.get(roomId);

        if (!room) {
            room = {
                id: roomId,
                players: [],
                gameState: {
                    currentRound: 1,
                    dealerIndex: 0,
                    currentPlayerIndex: 0,
                    status: 'WAITING',
                    trump: null,
                    table: [],
                    scoreHistory: []
                },
                timers: new Map()
            };
            this.rooms.set(roomId, room);
        }

        const existingPlayer =
            room.players.find(p => p.userId === user.userId);

        if (existingPlayer) {

            if (existingPlayer.online) {
                return { error: "Vous êtes déjà connecté." };
            }

            existingPlayer.id = socket.id;
            existingPlayer.online = true;

            this.socketToRoom.set(socket.id, roomId);

            if (room.timers.has(user.userId)) {
                clearTimeout(room.timers.get(user.userId));
                room.timers.delete(user.userId);
            }

            return {
                room,
                player: existingPlayer,
                isReconnection: true
            };
        }

        if (room.players.length >= 4) {
            return { error: "La salle est pleine." };
        }

        const newPlayer = {
            id: socket.id,
            userId: user.userId,
            name: user.pseudo,
            hand: [],
            bid: null,
            tricksWon: 0,
            score: 0,
            online: true
        };

        room.players.push(newPlayer);
        this.socketToRoom.set(socket.id, roomId);

        return {
            room,
            player: newPlayer,
            isReconnection: false
        };
    }

    handleDisconnect(socket, io) {

        const roomId = this.socketToRoom.get(socket.id);
        if (!roomId) return null;

        const room = this.rooms.get(roomId);
        if (!room) return null;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return null;

        player.online = false;
        this.socketToRoom.delete(socket.id);

        const timer = setTimeout(() => {

            const currentRoom = this.rooms.get(roomId);
            if (!currentRoom) return;

            const stillOffline = currentRoom.players
                .find(p => p.userId === player.userId)?.online === false;

            if (stillOffline) {
                this.deleteRoom(roomId);
            }

        }, 60000);

        room.timers.set(player.userId, timer);

        return roomId;
    }

    deleteRoom(roomId) {

        const room = this.rooms.get(roomId);
        if (!room) return;

        room.timers.forEach(timer => clearTimeout(timer));
        room.timers.clear();

        room.players.forEach(p => {
            if (p.id) {
                this.socketToRoom.delete(p.id);
            }
        });

        this.rooms.delete(roomId);
    }

    getPublicRooms() {

        const list = [];

        this.rooms.forEach(room => {

            if (room.players.length > 0) {
                list.push({
                    id: room.id,
                    players: room.players.length,
                    status: room.gameState.status
                });
            }

        });

        return list;
    }
}

module.exports = new RoomManager();
