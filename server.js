// server.js - Metaverse WebSocket Server (using 'ws')
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ***** MODIFICATION START *****
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for the root path FROM THE PUBLIC FOLDER
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// ***** MODIFICATION END *****


const gameState = {
    players: new Map(),
    npcs: [
    { id: 'npc1', name: 'Eva', position: { x: -32, y: 0, z: 60 }, color: '#800080', voiceGender: 'female', dialogue: "Hello!" },
    { id: 'npc2', name: 'Alex', position: { x: -47, y: 22, z: 53 }, color: '#8B4513', voiceGender: 'male', dialogue: "Hi there!" },
    { id: 'npc3', name: 'Maria', position: { x: 62, y: 19.5, z: -3 }, color: '#FF1493', voiceGender: 'female', dialogue: "Hi there!" },
    { id: 'npc4', name: 'Kenji', position: { x: -30, y: 0, z: 12 }, color: '#A0522D', voiceGender: 'male', dialogue: "Hello!" },
    { id: 'npc5', name: 'Bella', position: { x: 30, y: 0, z: 42 }, color: '#4682B4', voiceGender: 'female', dialogue: "Look who it is! It's nice to see you here." },
    { id: 'npc6', name: 'Leo', position: { x: 0, y: 0, z: -48 }, color: '#228B22', voiceGender: 'male', dialogue: "Hi!" },
    { id: 'npc7', name: 'Sam', position: { x: -16, y: 15, z: 30 }, color: '#DB7093', voiceGender: 'female', dialogue: "Howdy!" }
],
    chatHistory: []
};

function validatePlayerData(data) { return data && typeof data.name === 'string' && data.name.length > 0 && data.name.length <= 20 && typeof data.color === 'string' && /^#[0-9A-F]{6}$/i.test(data.color) && data.position && typeof data.position.x === 'number' && !isNaN(data.position.x) && typeof data.position.y === 'number' && !isNaN(data.position.y) && typeof data.position.z === 'number' && !isNaN(data.position.z); }
function sanitizeMessage(message) { if (typeof message !== 'string') return ''; return message.replace(/</g, "<").replace(/>/g, ">").substring(0, 100); }

function checkExactPhrase(input, phrase) {
    return input.includes(phrase);
}
function broadcast(type, payload, excludeWs = null) { const message = JSON.stringify({ type, payload }); wss.clients.forEach(client => { if (client !== excludeWs && client.readyState === WebSocket.OPEN) { client.send(message); } });}

wss.on('connection', (ws, req) => {
    ws.id = uuidv4();
    console.log(`🔗 New player connected: ${ws.id} from IP: ${req.socket.remoteAddress}`);

    ws.send(JSON.stringify({
        type: 'initialState',
        payload: { npcs: gameState.npcs, chatHistory: gameState.chatHistory.slice(-15) }
    }));

    ws.on('message', (messageString) => {
        let parsedMessage;
        try { parsedMessage = JSON.parse(messageString); }
        catch (e) { console.error(`🚨 Invalid JSON from ${ws.id}:`, messageString); ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid JSON message format.' }})); return; }

        const { type, payload } = parsedMessage;

        switch (type) {
            case 'playerJoin':
                if (!validatePlayerData(payload)) { ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid player data: ' + JSON.stringify(payload) }})); console.log('Invalid player data:', payload); return; }
                const player = { id: ws.id, name: payload.name, color: payload.color, hairColor: payload.hairColor, position: payload.position, rotation: payload.rotation || { x: 0, y: 0, z: 0 }, animationState: payload.animationState || 'idle', lastUpdate: Date.now(), joinTime: Date.now() };
                gameState.players.set(ws.id, player);
                ws.send(JSON.stringify({ type: 'joinConfirmation', payload: { playerId: player.id } }));
                broadcast('playerJoined', { id: player.id, name: player.name, color: player.color, hairColor: player.hairColor, position: player.position, rotation: player.rotation, animationState: player.animationState }, ws);
                const existingPlayers = Array.from(gameState.players.values()).filter(p => p.id !== ws.id).map(p => ({ id: p.id, name: p.name, color: p.color, hairColor: p.hairColor, position: p.position, rotation: p.rotation, animationState: p.animationState }));
                ws.send(JSON.stringify({ type: 'currentPlayers', payload: existingPlayers }));
                const welcomeMessage = { type: 'system', playerName: 'System', message: `🎉 ${player.name} joined the Metaverse!`, timestamp: Date.now() };
                gameState.chatHistory.push(welcomeMessage); if (gameState.chatHistory.length > 50) gameState.chatHistory.shift();
                broadcast('chatMessage', welcomeMessage); broadcast('playerCount', gameState.players.size);
                console.log(`🎮 ${player.name} (${ws.id}) joined. Players online: ${gameState.players.size}`);
                break;

            case 'playerMove':
                const movingPlayer = gameState.players.get(ws.id); if (!movingPlayer) return;
                if (!payload.position || typeof payload.position.x !== 'number' || typeof payload.position.y !== 'number' || typeof payload.position.z !== 'number' || !payload.rotation || typeof payload.rotation.y !== 'number') { console.log(`Invalid move data from ${movingPlayer.name}:`, payload); return; }
                const MAX_MOVE_PER_UPDATE_SQ = 5 * 5; const distSq = (payload.position.x - movingPlayer.position.x)**2 + (payload.position.y - movingPlayer.position.y)**2 + (payload.position.z - movingPlayer.position.z)**2;
                if (distSq > MAX_MOVE_PER_UPDATE_SQ * 1.1) console.warn(`⚠️ ${movingPlayer.name} moved too fast: ${Math.sqrt(distSq).toFixed(2)} units.`);
                movingPlayer.position = payload.position; movingPlayer.rotation = payload.rotation; movingPlayer.animationState = payload.animationState || ( (distSq > 0.001) ? 'walking' : 'idle'); movingPlayer.lastUpdate = Date.now();
                broadcast('playerMoved', { id: movingPlayer.id, position: movingPlayer.position, rotation: movingPlayer.rotation, animationState: movingPlayer.animationState }, ws);
                break;

            case 'playerAction':
                const actionPlayer = gameState.players.get(ws.id); if (!actionPlayer || !payload || !payload.action) return;
                broadcast('playerAction', { playerId: actionPlayer.id, action: payload.action, timestamp: Date.now() }, ws);
                break;

            case 'chatMessage':
                const chatPlayer = gameState.players.get(ws.id); if (!chatPlayer || !payload || typeof payload.message !== 'string') return;
                const sanitizedMsg = sanitizeMessage(payload.message); if (sanitizedMsg.length === 0) return;
                const chatMsgData = { type: 'player', playerId: chatPlayer.id, playerName: chatPlayer.name, message: sanitizedMsg, timestamp: Date.now() };
                gameState.chatHistory.push(chatMsgData); if (gameState.chatHistory.length > 50) gameState.chatHistory.shift();
                broadcast('chatMessage', chatMsgData); console.log(`💬 [${chatPlayer.name}]: ${sanitizedMsg}`);
                break;

            case 'npcInteract':
                const interactingPlayer = gameState.players.get(ws.id);
                if (!interactingPlayer) { console.error(`[Server ERROR] Player ${ws.id} not found for 'npcInteract'.`); return; }
                if (!payload || !payload.npcId) { console.error(`[Server ERROR] Invalid payload for 'npcInteract'. npcId missing.`); ws.send(JSON.stringify({ type: 'error', payload: { message: `Invalid payload: npcId missing.`}})); return; }
                const npc = gameState.npcs.find(n => n.id === payload.npcId);
                if (!npc) { console.error(`[Server ERROR] NPC ID '${payload.npcId}' not found.`); ws.send(JSON.stringify({ type: 'error', payload: { message: `NPC ID '${payload.npcId}' not found.`}})); return; }
                try {
                    ws.send(JSON.stringify({
                        type: 'npcDialogue',
                        payload: { npcId: npc.id, npcName: npc.name, dialogue: npc.dialogue, npcVoiceGender: npc.voiceGender }
                    }));
                    console.log(`[Server LOG] Sent initial 'npcDialogue' for ${npc.name} with gender ${npc.voiceGender}.`);
                } catch (sendError) { console.error(`[Server ERROR] Failed to send 'npcDialogue':`, sendError); }
                break;

            case 'npcUserSpeech':
    const speakingPlayer = gameState.players.get(ws.id);
    if (!speakingPlayer) { return; }
    if (!payload || !payload.npcId || typeof payload.text !== 'string') { return; }

    const targetNpcForSpeech = gameState.npcs.find(n => n.id === payload.npcId);
    if (!targetNpcForSpeech) { return; }

    const originalPlayerText = payload.text; // เก็บข้อความดั้งเดิมไว้
    console.log(`[Server LOG] ${speakingPlayer.name} said to ${targetNpcForSpeech.name}: "${originalPlayerText}"`);

    const playerSaid = originalPlayerText.toLowerCase().replace(/[.,!?;:]/g, "").trim();

    // Default response ใหม่: บอกว่าได้ยินอะไรมา
    let npcResponseText = `I heard you say, "${originalPlayerText}".`;
    let questionMatched = false; // ตัวแปรเพื่อเช็คว่ามีคำถามที่ตรงหรือไม่

    // ---- Specific NPC Dialogues using exact phrase checking ----
    switch (targetNpcForSpeech.id) {
        // NPC 1: Eva - Birthday Invitation
        case 'npc1':
            if (checkExactPhrase(playerSaid, "what kind of event are you planning") || checkExactPhrase(playerSaid, "could you tell me about the event you are organizing") || checkExactPhrase(playerSaid, "what's the special occasion") || checkExactPhrase(playerSaid, "what event are you hosting")) {
                npcResponseText = "Oh, I'm so excited! I'm planning a surprise 30th birthday party for my best friend, Chloe!";
                questionMatched = true;
            }
            else if (checkExactPhrase(playerSaid, "when will the event take place") || checkExactPhrase(playerSaid, "could you tell me the exact date and time")) {
                npcResponseText = "It's on Saturday, January 20th. The party starts at 7:00 PM. But remember, it's a surprise!";
                questionMatched = true;
            }
            else if (checkExactPhrase(playerSaid, "where is the event going to be held") || checkExactPhrase(playerSaid, "what is the full address of the venue")) {
                npcResponseText = "We're hosting it at 'The Rooftop Lounge' downtown. The view is amazing!";
                questionMatched = true;
            }
            else if (checkExactPhrase(playerSaid, "is there a dress code for the guests") || checkExactPhrase(playerSaid, "what should guests wear to the event") || checkExactPhrase(playerSaid, "do i have all the information i need") || checkExactPhrase(playerSaid, "is there anything else")) {
                npcResponseText = "The dress code is 'cocktail attire'. As for gifts, your presence is the best present, but if you insist, Chloe loves books! And please, RSVP to me, Eva, by January 15th.";
                questionMatched = true;
            }
            break;

        // NPC 2: Alex - Wedding Invitation
        case 'npc2':
             if (checkExactPhrase(playerSaid, "what kind of event are you planning") || checkExactPhrase(playerSaid, "could you tell me about the event you are organizing") || checkExactPhrase(playerSaid, "what's the special occasion") || checkExactPhrase(playerSaid, "what event are you hosting")) {
                npcResponseText = "It's the most important day! My partner, Jordan, and I are getting married and we're planning our wedding.";
                questionMatched = true;
            } else if (checkExactPhrase(playerSaid, "when will the event take place") || checkExactPhrase(playerSaid, "could you tell me the exact date and time")) {
                npcResponseText = "The ceremony will be on Saturday, March 16th, at 4:00 PM, with the reception to follow.";
                questionMatched = true;
            } else if (checkExactPhrase(playerSaid, "where is the event going to be held") || checkExactPhrase(playerSaid, "what is the full address of the venue")) {
                npcResponseText = "It will be at the beautiful 'Lakeside Gardens', located at 55 Serene Pathway.";
                questionMatched = true;
            } else if (checkExactPhrase(playerSaid, "is there a dress code for the guests") || checkExactPhrase(playerSaid, "what should guests wear to the event") || checkExactPhrase(playerSaid, "do i have all the information i need") || checkExactPhrase(playerSaid, "is there anything else")) {
                npcResponseText = "We'd love for our guests to be in formal attire. And please, RSVP by February 20th via our wedding website, alexandjordan.com.";
                questionMatched = true;
            }
            break;

        // NPC 3: Maria - Housewarming Invitation
        case 'npc3':
            if (checkExactPhrase(playerSaid, "what kind of event are you planning") || checkExactPhrase(playerSaid, "could you tell me about the event you are organizing") || checkExactPhrase(playerSaid, "what's the special occasion") || checkExactPhrase(playerSaid, "what event are you hosting")) {
                npcResponseText = "We've just moved into our new home! So, my husband and I are throwing a housewarming party.";
                questionMatched = true;
            } else if (checkExactPhrase(playerSaid, "when will the event take place") || checkExactPhrase(playerSaid, "could you tell me the exact date and time")) {
                npcResponseText = "It’s next Sunday, December 10th, from 2:00 PM onwards. You can come anytime in the afternoon.";
                questionMatched = true;
            } else if (checkExactPhrase(playerSaid, "where is the event going to be held") || checkExactPhrase(playerSaid, "what is the full address of the venue")) {
                npcResponseText = "At our new house, of course! It's at 123 Maple Street, in the suburbs.";
                questionMatched = true;
            } else if (checkExactPhrase(playerSaid, "is there a dress code for the guests") || checkExactPhrase(playerSaid, "what should guests wear to the event") || checkExactPhrase(playerSaid, "do i have all the information i need") || checkExactPhrase(playerSaid, "is there anything else")) {
                npcResponseText = "Oh, nothing fancy! Just casual clothing is perfect. Gifts are not necessary, just bring your good vibes! But a text to me, Maria, would be great so we know how much food to prepare.";
                questionMatched = true;
            }
            break;

        // NPC 4: Kenji - Retirement / Farewell Party Invitation
        case 'npc4':
            if (checkExactPhrase(playerSaid, "what kind of event are you planning") || checkExactPhrase(playerSaid, "could you tell me about the event you are organizing") || checkExactPhrase(playerSaid, "what's the special occasion") || checkExactPhrase(playerSaid, "what event are you hosting")) {
                npcResponseText = "We're organizing a farewell party for our beloved manager, Mr. Harrison, who is retiring after 40 years of service.";
                questionMatched = true;
            } else if (checkExactPhrase(playerSaid, "when will the event take place") || checkExactPhrase(playerSaid, "could you tell me the exact date and time")) {
                npcResponseText = "The party is on Friday, December 22nd, starting at 6:30 PM.";
                questionMatched = true;
            } else if (checkExactPhrase(playerSaid, "where is the event going to be held") || checkExactPhrase(playerSaid, "what is the full address of the venue")) {
                npcResponseText = "We've booked the 'Grand Ballroom' at the Horizon Hotel, 500 Central Avenue.";
                questionMatched = true;
            } else if (checkExactPhrase(playerSaid, "is there a dress code for the guests") || checkExactPhrase(playerSaid, "what should guests wear to the event") || checkExactPhrase(playerSaid, "do i have all the information i need") || checkExactPhrase(playerSaid, "is there anything else")) {
                npcResponseText = "The dress code is business casual. We'll be collecting contributions for a group gift. Please RSVP to me, Kenji, by December 18th for catering purposes.";
                questionMatched = true;
            }
            break;

        // NPC 5: Bella - Ordination Invitation
        case 'npc5':
            if (checkExactPhrase(playerSaid, "what kind of event are you planning") || checkExactPhrase(playerSaid, "could you tell me about the event you are organizing") || checkExactPhrase(playerSaid, "what's the special occasion") || checkExactPhrase(playerSaid, "what event are you hosting")) {
                npcResponseText = "It's a very spiritual occasion. My son, Ananda, will be ordained as a monk. We're holding an ordination ceremony for him.";
                questionMatched = true;
            } else if (checkExactPhrase(playerSaid, "when will the event take place") || checkExactPhrase(playerSaid, "could you tell me the exact date and time")) {
                npcResponseText = "The ceremony is on Sunday, January 28th, starting early at 9:00 AM.";
                questionMatched = true;
            } else if (checkExactPhrase(playerSaid, "where is the event going to be held") || checkExactPhrase(playerSaid, "what is the full address of the venue")) {
                npcResponseText = "It will be held at 'Wat Chai Mongkhon' (Chai Mongkhon Temple).";
                questionMatched = true;
            } else if (checkExactPhrase(playerSaid, "is there a dress code for the guests") || checkExactPhrase(playerSaid, "what should guests wear to the event") || checkExactPhrase(playerSaid, "do i have all the information i need") || checkExactPhrase(playerSaid, "is there anything else")) {
                npcResponseText = "We kindly ask guests to wear polite, modest clothing, preferably in white or light colors. No gifts are needed; your presence to witness this sacred event is the greatest gift.";
                questionMatched = true;
            }
            break;

        // NPC 6: Leo - Funeral Invitation
        case 'npc6':
            if (checkExactPhrase(playerSaid, "what kind of event are you planning") || checkExactPhrase(playerSaid, "could you tell me about the event you are organizing") || checkExactPhrase(playerSaid, "what's the special occasion") || checkExactPhrase(playerSaid, "what event are you hosting")) {
                npcResponseText = "Our family is gathering to remember and honor the life of my grandmother, Eleanor Vance.";
                questionMatched = true;
            } else if (checkExactPhrase(playerSaid, "when will the event take place") || checkExactPhrase(playerSaid, "could you tell me the exact date and time")) {
                npcResponseText = "The funeral service will be held this Friday, December 1st, at 2:00 PM.";
                questionMatched = true;
            } else if (checkExactPhrase(playerSaid, "where is the event going to be held") || checkExactPhrase(playerSaid, "what is the full address of the venue")) {
                npcResponseText = "The service will be at 'Serenity Chapel' on Hilltop Road, followed by the burial at the adjacent cemetery.";
                questionMatched = true;
            } else if (checkExactPhrase(playerSaid, "is there a dress code for the guests") || checkExactPhrase(playerSaid, "what should guests wear to the event") || checkExactPhrase(playerSaid, "do i have all the information i need") || checkExactPhrase(playerSaid, "is there anything else")) {
                npcResponseText = "We would appreciate it if guests wore black or respectful dark-colored attire. Your presence and support mean everything to us; please, no flowers or gifts.";
                questionMatched = true;
            }
            break;

        // NPC 7: Sam - Songkran (Thai New Year) Invitation
        case 'npc7':
            if (checkExactPhrase(playerSaid, "what kind of event are you planning") || checkExactPhrase(playerSaid, "could you tell me about the event you are organizing") || checkExactPhrase(playerSaid, "what's the special occasion") || checkExactPhrase(playerSaid, "what event are you hosting")) {
                npcResponseText = "We are hosting a community celebration for 'Songkran', the Thai New Year Festival! It will be a day of water, blessings, and fun.";
                questionMatched = true;
            } else if (checkExactPhrase(playerSaid, "when will the event take place") || checkExactPhrase(playerSaid, "could you tell me the exact date and time")) {
                npcResponseText = "It’s on April 13th, all day from 10:00 AM to 5:00 PM.";
                questionMatched = true;
            } else if (checkExactPhrase(playerSaid, "where is the event going to be held") || checkExactPhrase(playerSaid, "what is the full address of the venue")) {
                npcResponseText = "The main festivities will be at the 'Community Town Square'.";
                questionMatched = true;
            } else if (checkExactPhrase(playerSaid, "is there a dress code for the guests") || checkExactPhrase(playerSaid, "what should guests wear to the event") || checkExactPhrase(playerSaid, "do i have all the information i need") || checkExactPhrase(playerSaid, "is there anything else")) {
                npcResponseText = "Wear comfortable clothes that you don't mind getting wet! Floral shirts are encouraged. And don't forget your water gun! It's a free public event.";
                questionMatched = true;
            }
            break;
    }

    try {
        ws.send(JSON.stringify({
            type: 'npcDialogue',
            payload: { npcId: targetNpcForSpeech.id, npcName: targetNpcForSpeech.name, dialogue: npcResponseText, npcVoiceGender: targetNpcForSpeech.voiceGender }
        }));
        if(questionMatched) {
             console.log(`[Server LOG] Matched question for ${targetNpcForSpeech.name}.`);
        } else {
             console.log(`[Server LOG] No question matched for ${targetNpcForSpeech.name}. Sent default response.`);
        }
    } catch (sendError) { console.error(`[Server ERROR] Failed to send 'npcDialogue' (speech):`, sendError); }
    break;


            default:
                console.log(`❓ Unknown message type from ${ws.id}: ${type}`);
                ws.send(JSON.stringify({ type: 'error', payload: { message: `Unknown message type: ${type}` }}));
        }
    });

    ws.on('close', (code, reason) => {
        const player = gameState.players.get(ws.id);
        if (player) {
            gameState.players.delete(ws.id);
            broadcast('playerLeft', { id: player.id, name: player.name });
            const leaveMessage = { type: 'system', playerName: 'System', message: `${player.name} left the Metaverse 👋`, timestamp: Date.now() };
            gameState.chatHistory.push(leaveMessage); if (gameState.chatHistory.length > 50) gameState.chatHistory.shift();
            broadcast('chatMessage', leaveMessage); broadcast('playerCount', gameState.players.size);
            console.log(`👋 ${player.name} (${ws.id}) left (Code: ${code}, Reason: ${reason ? reason.toString() : 'N/A'}). Players online: ${gameState.players.size}`);
        } else console.log(`👋 WebSocket player ${ws.id} left (never fully joined)`);
    });
    ws.on('error', (error) => { console.error(`💥 WebSocket Error for ${ws.id}:`, error); });
});

setInterval(() => { const now = Date.now(); wss.clients.forEach(clientWs => { const player = gameState.players.get(clientWs.id); if (player && (now - player.lastUpdate > 300000)) { console.log(`⏰ Player timed out: ${player.name}. Disconnecting.`); clientWs.terminate(); } }); }, 10000);

app.get('/api/stats', (req, res) => { res.json({ playersOnline: gameState.players.size, totalNPCs: gameState.npcs.length, chatHistoryLength: gameState.chatHistory.length, uptimeSeconds: Math.floor(process.uptime()) }); });
app.use((err, req, res, next) => { console.error("💥 Express Error:", err.stack); res.status(500).send('Server error!'); });
process.on('uncaughtException', (err, origin) => { console.error(`💥 Uncaught Exception: ${err.stack || err} at ${origin}`); });
process.on('unhandledRejection', (reason, promise) => { console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason); });

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Metaverse Server started on port ${PORT}`);
    console.log(`🌐 Access at: http://localhost:${PORT}`);
});
