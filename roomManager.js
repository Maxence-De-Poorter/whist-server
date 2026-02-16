const { normalizeRoomId } = require('./validators');

class RoomManager {
    constructor() {
        this.rooms = new Map();
        this.socketToRoom = new Map();
    }

    getRoom(roomId) {
        if (!roomId) return null;
        return this.rooms.get(roomId) || null;
    }

    ensureRoom(roomId) {
        const id = normalizeRoomId(roomId);
        if (!id) return null;

        let room = this.rooms.get(id);

        if (!room) {
            room = {
                id,
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
                meta: {
                    timersByUserId: new Map(),
                    createdAt: Date.now(),
                    lastActivityAt: Date.now()
                }
            };

            this.rooms.set(id, room);
        }

        return room;
    }

    touch(room) {
        if (room?.meta) {
            room.meta.lastActivityAt = Date.now();
        }
    }

    createOrJoin(roomId, socket, user) {
        if (!socket?.id || !user?.userId || !user?.pseudo) {
            return { error: 'Paramètres invalides.' };
        }

        const room = this.ensureRoom(roomId);
        if (!room) return { error: 'Room ID invalide.' };

        this.touch(room);

        const existingPlayer = room.players.find(
            (p) => p.userId === user.userId
        );

        // 🔁 Reconnexion
        if (existingPlayer) {
            if (existingPlayer.online) {
                return { error: 'Vous êtes déjà connecté.' };
            }

            existingPlayer.id = socket.id;
            existingPlayer.online = true;

            this.socketToRoom.set(socket.id, room.id);

            // Clear ancien timer
            const timers = room.meta.timersByUserId;
            const existingTimer = timers.get(user.userId);

            if (existingTimer) {
                clearTimeout(existingTimer);
                timers.delete(user.userId);
            }

            return {
                room,
                player: existingPlayer,
                isReconnection: true
            };
        }

        // 🚫 Salle pleine
        if (room.players.length >= 4) {
            return { error: 'La salle est pleine.' };
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
        this.socketToRoom.set(socket.id, room.id);

        return {
            room,
            player: newPlayer,
            isReconnection: false
        };
    }

    handleDisconnect(socket) {
        if (!socket?.id) return null;

        const roomId = this.socketToRoom.get(socket.id);
        if (!roomId) return null;

        const room = this.rooms.get(roomId);
        if (!room) {
            this.socketToRoom.delete(socket.id);
            return null;
        }

        const player = room.players.find(
            (p) => p.id === socket.id
        );

        if (!player) {
            this.socketToRoom.delete(socket.id);
            return null;
        }

        player.online = false;
        this.socketToRoom.delete(socket.id);
        this.touch(room);

        // ⏳ Timer suppression salle si personne ne revient
        const timeout = setTimeout(() => {
            const currentRoom = this.rooms.get(roomId);
            if (!currentRoom) return;

            const nobodyOnline = currentRoom.players.every(
                (p) => !p.online
            );

            if (nobodyOnline) {
                this.deleteRoom(roomId);
            }
        }, 60000);

        room.meta.timersByUserId.set(player.userId, timeout);

        return roomId;
    }

    deleteRoom(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        // Clear tous les timers
        room.meta.timersByUserId.forEach((timer) =>
            clearTimeout(timer)
        );
        room.meta.timersByUserId.clear();

        // Nettoyage socket map
        room.players.forEach((p) => {
            if (p.id) {
                this.socketToRoom.delete(p.id);
            }
        });

        this.rooms.delete(roomId);
    }

    getPublicRooms() {
        const list = [];

        this.rooms.forEach((room) => {
            if (room.players.length > 0) {
                list.push({
                    id: room.id,
                    players: room.players.length,
                    status: room.gameState.status,
                    lastActivityAt: room.meta.lastActivityAt
                });
            }
        });

        return list;
    }

    /**
     * Optionnel : nettoyage périodique des rooms inactives
     * (utile en prod Fly pour éviter accumulation mémoire)
     */
    cleanupInactiveRooms(maxIdleMs = 10 * 60 * 1000) {
        const now = Date.now();

        this.rooms.forEach((room, roomId) => {
            const idleTime = now - room.meta.lastActivityAt;

            if (
                idleTime > maxIdleMs &&
                room.players.every((p) => !p.online)
            ) {
                this.deleteRoom(roomId);
            }
        });
    }
}

const roomManager = new RoomManager();

module.exports = {
    RoomManager,
    roomManager
};
