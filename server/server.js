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

function deleteRoomState(room) {
  if (roomStates[room]) {
    console.log(`🧹 Room "${room}" is now empty. Clearing its history.`);
    delete roomStates[room];
  }
}

// Helper: get array of socket IDs in a room
function getClientsInRoom(room) {
  const s = io.sockets.adapter.rooms.get(room);
  return s ? Array.from(s) : [];
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Default join 'main' room
  const defaultRoom = 'main';
  socket.join(defaultRoom);
  socket.currentRoom = defaultRoom;

  // Initialize main room state
  const state = getRoomState(defaultRoom);
  socket.emit('initCanvas', state.strokes);
  io.in(defaultRoom).emit('userListUpdate', getClientsInRoom(defaultRoom));

  // Join or switch room
  socket.on('joinRoom', (roomName) => {
    if (!roomName) roomName = 'main';
    const prevRoom = socket.currentRoom;

    if (prevRoom === roomName) {
      socket.emit('initCanvas', getRoomState(roomName).strokes);
      socket.emit('userListUpdate', getClientsInRoom(roomName));
      return;
    }

    // Leave previous room
    if (prevRoom) {
      socket.leave(prevRoom);
      io.in(prevRoom).emit('userListUpdate', getClientsInRoom(prevRoom));

      // Clean up room if empty now
      const prevUsers = getClientsInRoom(prevRoom);
      if (prevUsers.length === 0) {
        deleteRoomState(prevRoom);
      }
    }

    // Join new room
    socket.join(roomName);
    socket.currentRoom = roomName;

    // Initialize or retrieve the room state
    const newState = getRoomState(roomName);

    // Send its current canvas to the joining socket
    socket.emit('initCanvas', newState.strokes);

    // Broadcast user list for the new room
    io.in(roomName).emit('userListUpdate', getClientsInRoom(roomName));
    broadcastRoomSummary(); 
    // Rebind socket event handlers for new room state
    handleSocketEvents(io, socket, newState);

    console.log(`Socket ${socket.id} joined room "${roomName}"`);
  });

  // Handle disconnect cleanup
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    const room = socket.currentRoom;

    if (room) {
      io.in(room).emit('userListUpdate', getClientsInRoom(room));
      socket.to(room).emit('cursorRemove', socket.id);

      // If no users remain, delete that room's history
      const remaining = getClientsInRoom(room);
      if (remaining.length === 0) {
        deleteRoomState(room);
      }
      broadcastRoomSummary(); 
    }
  });
});

// Broadcast active room summary to all clients
function broadcastRoomSummary() {
  const summary = [];
  for (const room in roomStates) {
    const users = getClientsInRoom(room);
    summary.push({ room, users: users.length });
  }
  io.emit('roomSummaryUpdate', summary);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
