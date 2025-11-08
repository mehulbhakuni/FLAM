// server/drawing-state.js
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'canvasState.json');

// Save strokes persistently (optional resilience)
function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state.strokes, null, 2));
  } catch (err) {
    console.error('Error saving canvas state:', err);
  }
}

// Load previous strokes (optional)
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading saved state:', err);
  }
  return [];
}

function initDrawingState() {
  return {
    strokes: loadState(),         // Load previous strokes (persistent)
    undoneStrokesByUser: {},      // Track undone strokes per user
    cursors: {},                  // Track live cursors for each user
  };
}

function handleSocketEvents(io, socket, state) {
  socket.on('draw', (stroke) => {
    stroke.userId = socket.id;
    state.strokes.push(stroke);

    // Persist state for resilience
    saveState(state);

    // Broadcast new stroke to everyone
    io.emit('draw', stroke);
  });

  socket.on('undo', () => {
    const lastIndex = [...state.strokes]
      .reverse()
      .findIndex((s) => s.userId === socket.id);

    if (lastIndex === -1) return; // No stroke to undo for this user

    const indexToRemove = state.strokes.length - 1 - lastIndex;
    const [removedStroke] = state.strokes.splice(indexToRemove, 1);

    if (!state.undoneStrokesByUser[socket.id]) {
      state.undoneStrokesByUser[socket.id] = [];
    }
    state.undoneStrokesByUser[socket.id].push(removedStroke);

    saveState(state);
    io.emit('updateCanvas', state.strokes);
  });

  socket.on('redo', () => {
    const undoneList = state.undoneStrokesByUser[socket.id];
    if (!undoneList || !undoneList.length) return;

    const stroke = undoneList.pop();
    state.strokes.push(stroke);

    saveState(state);
    io.emit('updateCanvas', state.strokes);
  });

  socket.on('clearCanvas', () => {
    state.strokes = [];
    state.undoneStrokesByUser = {};
    saveState(state);
    io.emit('clearCanvas');
  });

  socket.on('cursorMove', (pos) => {
    state.cursors[socket.id] = pos;
    socket.broadcast.emit('cursorMove', { userId: socket.id, pos });
  });

  socket.on('requestCanvasState', () => {
    socket.emit('canvasState', state.strokes);
  });

  socket.on('disconnect', () => {
    // Remove user's cursor
    delete state.cursors[socket.id];
    socket.broadcast.emit('cursorRemove', socket.id);

    // Cleanup their redo history
    delete state.undoneStrokesByUser[socket.id];

    console.log(`User disconnected: ${socket.id}`);
  });
}

module.exports = { initDrawingState, handleSocketEvents };
