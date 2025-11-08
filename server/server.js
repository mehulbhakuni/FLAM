// server/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { initDrawingState, handleSocketEvents } = require('./drawing-state');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '../client')));

const drawingState = initDrawingState();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Send the full current state to the new user
  socket.emit('initCanvas', drawingState.strokes);

  // Send current user list
  io.emit('userListUpdate', Object.keys(io.sockets.sockets));

  handleSocketEvents(io, socket, drawingState);

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    io.emit('userListUpdate', Object.keys(io.sockets.sockets));
    // Clean up per-user undo/redo stacks (resilience improvement)
    if (drawingState.undoneStrokesByUser)
      delete drawingState.undoneStrokesByUser[socket.id];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
