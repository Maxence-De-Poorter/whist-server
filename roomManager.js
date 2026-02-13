class RoomManager {
    constructor() {
        this.rooms = new Map();
        this.socketToRoom = new Map();
    }

    getRoom(roomId) {
        if (!roomId || typeof roomId !== 'string') return null;
        return this.rooms.get(roomId.toUpperCase()) || null;
    }

    createOrJoin(roomId, socket, pseudo) {
        if (
            !roomId ||
            !pseudo ||
            typeof roomId !== 'string' ||
            typeof pseudo !== 'string'
        ) {
            return { error: "Paramètres invalides." };
        }

        roomId = roomId.toUpperCase().trim();
        pseudo = pseudo.trim();

        let room = this.rooms.get(roomId);

        // --- Création room ---
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

        const existingPlayer = room.players.find(p => p.name === pseudo);

        // ==========================
        // 1️⃣ RECONNEXION
        // ==========================
        if (existingPlayer) {

            if (existingPlayer.online) {
                return {
                    error: "Ce pseudo est déjà utilisé et le joueur est en ligne."
                };
            }

            existingPlayer.id = socket.id;
            existingPlayer.online = true;

            this.socketToRoom.set(socket.id, roomId);

            // Annuler timer si existant
            if (room.timers.has(pseudo)) {
                clearTimeout(room.timers.get(pseudo));
                room.timers.delete(pseudo);
            }

            return {
                room,
                player: existingPlayer,
                isReconnection: true
            };
        }

        // ==========================
        // 2️⃣ NOUVEAU JOUEUR
        // ==========================
        if (room.players.length >= 4) {
            return { error: "La salle est pleine." };
        }

        const newPlayer = {
            id: socket.id,
            name: pseudo,
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
        if (!room) {
            this.socketToRoom.delete(socket.id);
            return null;
        }

        const player = room.players.find(p => p.id === socket.id);
        if (!player) {
            this.socketToRoom.delete(socket.id);
            return null;
        }

        player.online = false;
        this.socketToRoom.delete(socket.id);

        console.log(`⏱️ Attente reconnexion : ${player.name} (${roomId})`);

        // --- Timer de suppression ---
        const timer = setTimeout(() => {
            const currentRoom = this.rooms.get(roomId);
            if (!currentRoom) return;

            const stillOffline = currentRoom.players
                .find(p => p.name === player.name)?.online === false;

            if (stillOffline) {
                console.log(
                    `💀 Suppression de la room ${roomId} (Joueur ${player.name} perdu)`
                );

                io.to(roomId).emit(
                    'error_message',
                    `Partie terminée : ${player.name} a mis trop de temps à revenir.`
                );

                this.deleteRoom(roomId);
            }
        }, 60000);

        room.timers.set(player.name, timer);

        // --- Suppression immédiate si plus personne en ligne ---
        const anyoneOnline = room.players.some(p => p.online);
        if (!anyoneOnline) {
            console.log(`🧹 Salle ${roomId} vide, suppression immédiate.`);
            this.deleteRoom(roomId);
        }

        return roomId;
    }

    // ==========================
    // 🧹 Suppression propre d'une room
    // ==========================
    deleteRoom(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        // Clear tous les timers
        room.timers.forEach(timer => clearTimeout(timer));
        room.timers.clear();

        // Nettoyer socketToRoom
        room.players.forEach(p => {
            if (p.id) {
                this.socketToRoom.delete(p.id);
            }
        });

        this.rooms.delete(roomId);
    }

    getPublicRooms() {
        const roomsList = [];

        this.rooms.forEach((room) => {
            if (room.players.length > 0) {
                roomsList.push({
                    id: room.id,
                    players: room.players.length,
                    status: room.gameState.status
                });
            }
        });

        return roomsList;
    }

}

module.exports = new RoomManager();
