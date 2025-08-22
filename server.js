const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

app.use(cors());

const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const channels = new Map();
const users = new Map();

app.get('/', (req, res) => {
    res.send(`
        <h1>📻 Radinho Server</h1>
        <p>Status: ✅ Online</p>
        <p>Canais ativos: ${channels.size}</p>
        <p>Usuários online: ${users.size}</p>
    `);
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    let currentUser = null;
    let currentChannel = null;
    
    socket.on('join', (data) => {
        const { user, channel } = data;
        currentUser = { ...user, socketId: socket.id };
        currentChannel = channel;
        
        users.set(socket.id, currentUser);
        
        if (!channels.has(channel)) {
            channels.set(channel, new Map());
        }
        
        const channelUsers = channels.get(channel);
        channelUsers.set(socket.id, currentUser);
        
        socket.join(channel);
        
        const usersList = Array.from(channelUsers.values());
        io.to(channel).emit('users', usersList);
        
        socket.to(channel).emit('userJoined', currentUser);
        
        console.log(`${user.name} joined channel ${channel}`);
    });
    
    socket.on('speaking', (data) => {
        const { userId, channel } = data;
        socket.to(channel).emit('userSpeaking', userId);
    });
    
    socket.on('stopSpeaking', (data) => {
        const { userId, channel } = data;
        socket.to(channel).emit('userStoppedSpeaking', userId);
    });
    
   socket.on('audioData', (data) => {
    const { userId, audio, channel, mimeType } = data;
    
    // Log para debug
    console.log(`Áudio recebido de ${currentUser?.name}, tamanho: ${audio?.length || 0} bytes`);
    
    // Validar dados antes de enviar
    if (!audio || !channel) {
        console.error('Dados de áudio inválidos');
        return;
    }
    
    // Enviar áudio para todos no canal, exceto o remetente
    socket.to(channel).emit('audioData', {
        userId: userId,
        audio: audio,
        userName: currentUser?.name,
        mimeType: mimeType || 'audio/webm',
        timestamp: Date.now() // Adiciona timestamp para debug
    });
    
    console.log(`Áudio transmitido para o canal ${channel}`);
});
    
    socket.on('disconnect', () => {
        if (currentUser && currentChannel) {
            const channelUsers = channels.get(currentChannel);
            if (channelUsers) {
                channelUsers.delete(socket.id);
                
                if (channelUsers.size === 0) {
                    channels.delete(currentChannel);
                } else {
                    const usersList = Array.from(channelUsers.values());
                    io.to(currentChannel).emit('users', usersList);
                }
            }
            
            socket.to(currentChannel).emit('userLeft', currentUser);
            users.delete(socket.id);
            
            console.log(`${currentUser.name} left channel ${currentChannel}`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
