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

// In-memory map of roomName -> drawing state
const roomStates = {};

function getRoomState(room) {
  if (!room) room = 'main';
  if (!roomStates[room]) {
    roomStates[room] = initDrawingState(room);
  }
  return roomStates[room];
}

// Helper to get array of socket ids in a room
function getClientsInRoom(room) {
  const s = io.sockets.adapter.rooms.get(room);
  return s ? Array.from(s) : [];
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Default join main room
  const defaultRoom = 'main';
  socket.join(defaultRoom);
  socket.currentRoom = defaultRoom;

  // Ensure room state exists and send initial canvas
  const state = getRoomState(defaultRoom);
  socket.emit('initCanvas', state.strokes);

  // Send current user list for that room
  io.in(defaultRoom).emit('userListUpdate', getClientsInRoom(defaultRoom));
  // Handle room joining/switching
  socket.on('joinRoom', (roomName) => {
    if (!roomName) roomName = 'main';
    const prev = socket.currentRoom;

    if (prev === roomName) {
      // Already in this room — just refresh canvas and list
      socket.emit('initCanvas', getRoomState(roomName).strokes);
      socket.emit('userListUpdate', getClientsInRoom(roomName));
      return;
    }

    // Leave previous room
    if (prev) {
      socket.leave(prev);
      io.in(prev).emit('userListUpdate', getClientsInRoom(prev));
    }

    // Join new room
    socket.join(roomName);
    socket.currentRoom = roomName;

    // Get the room's drawing state
    const newState = getRoomState(roomName);

    // Send that room's canvas immediately
    socket.emit('initCanvas', newState.strokes);

    // Broadcast updated user list
    io.in(roomName).emit('userListUpdate', getClientsInRoom(roomName));

    handleSocketEvents(io, socket, newState);

    console.log(`Socket ${socket.id} joined room ${roomName}`);
  });

  // Handle disconnect cleanup
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    const room = socket.currentRoom;
    if (room) {
      io.in(room).emit('userListUpdate', getClientsInRoom(room));
      socket.to(room).emit('cursorRemove', socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
