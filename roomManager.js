/**
 * @file roomManager.js
 * @description Gestionnaire central des rooms du jeu de Whist :
 * création, reconnexion, déconnexion, et suppression automatique.
 */

'use strict';

class RoomManager {
    constructor() {
        /** @type {Map<string, Room>} */
        this.rooms = new Map();

        /** @type {Map<string, string>} socket.id -> roomId */
        this.socketToRoom = new Map();
    }

    /**
     * Retourne une room à partir de son identifiant.
     * @param {string} roomId
     * @returns {Room|null}
     */
    getRoom(roomId) {
        if (typeof roomId !== 'string') return null;
        return this.rooms.get(roomId.toUpperCase()) || null;
    }

    /**
     * Crée une nouvelle room ou rejoint une room existante.
     * Gère aussi la reconnexion d’un joueur.
     * @param {string} roomId
     * @param {import('socket.io').Socket} socket
     * @param {string} pseudo
     * @returns {{ room?: Room, player?: Player, isReconnection?: boolean, error?: string }}
     */
    createOrJoin(roomId, socket, pseudo) {
        if (typeof roomId !== 'string' || typeof pseudo !== 'string' || !roomId.trim() || !pseudo.trim()) {
            return { error: 'Paramètres invalides.' };
        }

        roomId = roomId.toUpperCase().trim();
        pseudo = pseudo.trim();

        let room = this.rooms.get(roomId);

        // --- Création d'une nouvelle room ---
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
                return { error: 'Ce pseudo est déjà utilisé et le joueur est en ligne.' };
            }

            existingPlayer.id = socket.id;
            existingPlayer.online = true;
            this.socketToRoom.set(socket.id, roomId);

            // Annuler timer si existant
            if (room.timers.has(pseudo)) {
                clearTimeout(room.timers.get(pseudo));
                room.timers.delete(pseudo);
            }

            return { room, player: existingPlayer, isReconnection: true };
        }

        // ==========================
        // 2️⃣ NOUVEAU JOUEUR
        // ==========================
        if (room.players.length >= 4) {
            return { error: 'La salle est pleine.' };
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

        return { room, player: newPlayer, isReconnection: false };
    }

    /**
     * Gère la déconnexion d’un joueur :
     * - le marque comme hors ligne
     * - supprime la room si vide
     * - programme la suppression après 60s si non reconnecté
     * @param {import('socket.io').Socket} socket
     * @param {import('socket.io').Server} io
     * @returns {string|null} roomId
     */
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

        console.log(`⏱️ ${player.name} (${roomId}) déconnecté — en attente de reconnexion...`);

        // --- Timer de suppression différée ---
        const timer = setTimeout(() => {
            const currentRoom = this.rooms.get(roomId);
            if (!currentRoom) return;

            const stillOffline = currentRoom.players.find(p => p.name === player.name)?.online === false;
            if (stillOffline) {
                console.log(`💀 Suppression de la room ${roomId} (joueur ${player.name} non revenu)`);

                io.to(roomId).emit(
                    'error_message',
                    `Partie terminée : ${player.name} a mis trop de temps à revenir.`
                );

                this.deleteRoom(roomId);
            }
        }, 60_000);

        room.timers.set(player.name, timer);

        // --- Suppression immédiate si plus personne connectée ---
        if (!room.players.some(p => p.online)) {
            console.log(`🧹 Salle ${roomId} vide → suppression immédiate.`);
            this.deleteRoom(roomId);
        }

        return roomId;
    }

    /**
     * Supprime proprement une room et nettoie toutes ses références.
     * @param {string} roomId
     */
    deleteRoom(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        // Annule tous les timers actifs
        for (const timer of room.timers.values()) clearTimeout(timer);
        room.timers.clear();

        // Nettoie les sockets associées
        for (const player of room.players) {
            if (player.id) this.socketToRoom.delete(player.id);
        }

        this.rooms.delete(roomId);
    }
}

/**
 * @typedef {Object} Player
 * @property {string} id
 * @property {string} name
 * @property {Array<{suit: string, value: string}>} hand
 * @property {number|null} bid
 * @property {number} tricksWon
 * @property {number} score
 * @property {boolean} online
 */

/**
 * @typedef {Object} Room
 * @property {string} id
 * @property {Player[]} players
 * @property {{
 *   currentRound: number,
 *   dealerIndex: number,
 *   currentPlayerIndex: number,
 *   status: string,
 *   trump: {suit: string, value: string}|null,
 *   table: Array<{playerName: string, card: {suit: string, value: string}}>,
 *   scoreHistory: Array<{round: number, results: Array<{bid: number, points: number, total: number}>}>
 * }} gameState
 * @property {Map<string, NodeJS.Timeout>} timers
 */

module.exports = new RoomManager();
