const Engine = require('./gameEngine');

class RoomManager {
    constructor() {
        this.rooms = new Map();
        // Optimisation : lien direct socketId -> roomId pour éviter les boucles
        this.socketToRoom = new Map();
    }

    getRoom(roomId) {
        return roomId ? this.rooms.get(roomId.toUpperCase()) : null;
    }

    createOrJoin(roomId, socket, pseudo) {
        roomId = roomId.toUpperCase();
        let room = this.rooms.get(roomId);

        if (!room) {
            room = {
                id: roomId,
                players: [],
                gameState: {
                    currentRound: 1, dealerIndex: 0, currentPlayerIndex: 0,
                    status: 'WAITING', trump: null, table: [], scoreHistory: []
                },
                timers: new Map()
            };
            this.rooms.set(roomId, room);
        }

        const existingPlayer = room.players.find(p => p.name === pseudo);

        // 1. GESTION RECONNEXION
        if (existingPlayer) {
            // SÉCURITÉ : Empêcher de prendre la place de quelqu'un de déjà connecté
            if (existingPlayer.online) {
                return { error: "Ce pseudo est déjà utilisé et le joueur est en ligne." };
            }

            existingPlayer.id = socket.id;
            existingPlayer.online = true;
            this.socketToRoom.set(socket.id, roomId);

            if (room.timers.has(pseudo)) {
                clearTimeout(room.timers.get(pseudo));
                room.timers.delete(pseudo);
            }
            return { room, player: existingPlayer, isReconnection: true };
        }

        // 2. NOUVEAU JOUEUR
        if (room.players.length < 4) {
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
            return { room, player: newPlayer, isReconnection: false };
        }

        return { error: "La salle est pleine." };
    }

    handleDisconnect(socket, io) {
        const roomId = this.socketToRoom.get(socket.id);
        if (!roomId) return null;

        const room = this.rooms.get(roomId);
        if (!room) return null;

        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.online = false;
            this.socketToRoom.delete(socket.id);

            console.log(`⏱️ Attente reconnexion : ${player.name} (${roomId})`);

            const timer = setTimeout(() => {
                if (!player.online) {
                    console.log(`💀 Suppression de la room ${roomId} (Joueur ${player.name} perdu)`);
                    io.to(roomId).emit('error_message', `Partie terminée : ${player.name} a mis trop de temps à revenir.`);
                    this.rooms.delete(roomId);
                    // Nettoyer les socketToRoom restants pour cette room
                    room.players.forEach(p => this.socketToRoom.delete(p.id));
                }
            }, 60000);

            room.timers.set(player.name, timer);

            const anyoneLeft = room.players.some(p => p.online);
            if (!anyoneLeft) {
                console.log(`🧹 Salle ${roomId} vide, suppression immédiate.`);
                this.rooms.delete(roomId);
            }

            return roomId;
        }
        return null;
    }
}

module.exports = new RoomManager();