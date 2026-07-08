const { io } = require('socket.io-client');
const socket = io('http://127.0.0.1:3000', { path: '/socket.io' });

socket.on('connect', () => {
  console.log('Connected!');
  socket.emit('create_session', {}, (res) => {
    console.log('Created session:', res);
    process.exit(0);
  });
});

socket.on('connect_error', (err) => {
  console.error('Connection error:', err);
  process.exit(1);
});
