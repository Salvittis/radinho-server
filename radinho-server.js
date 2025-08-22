// server.js - Servidor do Radinho
// Cole este código no Glitch.com para ter um servidor GRÁTIS

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configurar CORS para aceitar conexões de qualquer origem
app.use(cors());
app.use(express.static('public'));

// Configurar Socket.IO com CORS
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});

// Armazenar canais e usuários
const channels = new Map();
const users = new Map();

// Página inicial do servidor
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Radinho Server</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                }
                .container {
                    text-align: center;
                    padding: 40px;
                    background: rgba(0,0,0,0.3);
                    border-radius: 20px;
                    backdrop-filter: blur(10px);
                }
                h1 { font-size: 48px; margin-bottom: 20px; }
                .status { 
                    display: inline-block;
                    padding: 10px 20px;
                    background: #10b981;
                    border-radius: 20px;
                    margin: 20px 0;
                }
                .stats {
                    margin-top: 30px;
                    font-size: 18px;
                }
                .channel-list {
                    margin-top: 20px;
                    padding: 20px;
                    background: rgba(0,0,0,0.2);
                    border-radius: 10px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📻 Radinho Server</h1>
                <div class="status">✅ Servidor Online</div>
                <div class="stats">
                    <p>Canais ativos: <strong id="channels">0</strong></p>
                    <p>Usuários conectados: <strong id="users">0</strong></p>
                </div>
                <div class="channel-list">
                    <h3>Canais Ativos:</h3>
                    <div id="channelList">Nenhum canal ativo</div>
                </div>
            </div>
            <script>
                function updateStats() {
                    fetch('/stats')
                        .then(res => res.json())
                        .then(data => {
                            document.getElementById('channels').textContent = data.channels;
                            document.getElementById('users').textContent = data.users;
                            
                            if (data.channelList.length > 0) {
                                document.getElementById('channelList').innerHTML = 
                                    data.channelList.map(ch => 
                                        '<div>' + ch.name + ' (' + ch.users + ' usuários)</div>'
                                    ).join('');
                            } else {
                                document.getElementById('channelList').textContent = 'Nenhum canal ativo';
                            }
                        });
                }
                
                updateStats();
                setInterval(updateStats, 5000);
            </script>
        </body>
        </html>
    `);
});

// Endpoint para estatísticas
app.get('/stats', (req, res) => {
    const channelList = [];
    channels.forEach((users, channelName) => {
        channelList.push({
            name: channelName,
            users: users.size
        });
    });
    
    res.json({
        channels: channels.size,
        users: users.size,
        channelList: channelList
    });
});

// Socket.IO - Gerenciar conexões
io.on('connection', (socket) => {
    console.log('Novo usuário conectado:', socket.id);
    
    let currentUser = null;
    let currentChannel = null;
    
    // Usuário entra no canal
    socket.on('join', (data) => {
        const { user, channel } = data;
        
        // Salvar informações do usuário
        currentUser = { ...user, socketId: socket.id };
        currentChannel = channel;
        
        // Adicionar usuário ao mapa global
        users.set(socket.id, currentUser);
        
        // Criar canal se não existir
        if (!channels.has(channel)) {
            channels.set(channel, new Map());
        }
        
        // Adicionar usuário ao canal
        const channelUsers = channels.get(channel);
        channelUsers.set(socket.id, currentUser);
        
        // Entrar na sala do Socket.IO
        socket.join(channel);
        
        // Enviar lista de usuários atualizada para todos no canal
        const usersList = Array.from(channelUsers.values());
        io.to(channel).emit('users', usersList);
        
        // Notificar outros usuários que alguém entrou
        socket.to(channel).emit('userJoined', currentUser);
        
        console.log(`${user.name} entrou no canal ${channel}`);
        console.log(`Canal ${channel} agora tem ${channelUsers.size} usuários`);
    });
    
    // Usuário começa a falar
    socket.on('speaking', (data) => {
        const { userId, channel } = data;
        socket.to(channel).emit('userSpeaking', userId);
        console.log(`${currentUser?.name} está falando no canal ${channel}`);
    });
    
    // Usuário para de falar
    socket.on('stopSpeaking', (data) => {
        const { userId, channel } = data;
        socket.to(channel).emit('userStoppedSpeaking', userId);
        console.log(`${currentUser?.name} parou de falar no canal ${channel}`);
    });
    
    // Transmitir áudio
    socket.on('audioData', (data) => {
        const { userId, audio, channel } = data;
        
        // Enviar áudio para todos no canal, exceto o remetente
        socket.to(channel).emit('audioData', {
            userId: userId,
            audio: audio,
            userName: currentUser?.name
        });
        
        console.log(`Áudio transmitido de ${currentUser?.name} para o canal ${channel}`);
    });
    
    // Desconexão
    socket.on('disconnect', () => {
        if (currentUser && currentChannel) {
            // Remover usuário do canal
            const channelUsers = channels.get(currentChannel);
            if (channelUsers) {
                channelUsers.delete(socket.id);
                
                // Se o canal ficou vazio, remover
                if (channelUsers.size === 0) {
                    channels.delete(currentChannel);
                    console.log(`Canal ${currentChannel} foi removido (vazio)`);
                } else {
                    // Enviar lista atualizada para os usuários restantes
                    const usersList = Array.from(channelUsers.values());
                    io.to(currentChannel).emit('users', usersList);
                }
            }
            
            // Notificar outros usuários que alguém saiu
            socket.to(currentChannel).emit('userLeft', currentUser);
            
            // Remover do mapa global de usuários
            users.delete(socket.id);
            
            console.log(`${currentUser.name} saiu do canal ${currentChannel}`);
        }
        
        console.log('Usuário desconectado:', socket.id);
    });
    
    // Tratamento de erros
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

// Manter o servidor Glitch acordado
app.get('/wake', (req, res) => {
    res.send('Server is awake!');
    console.log('Wake ping received');
});

// Porta do servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor Radinho rodando na porta ${PORT}`);
    console.log(`📻 Pronto para receber conexões!`);
});

// Log de status a cada minuto
setInterval(() => {
    console.log(`Status: ${channels.size} canais ativos, ${users.size} usuários online`);
}, 60000);