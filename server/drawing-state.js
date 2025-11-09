// server/drawing-state.js
const fs = require('fs');
const path = require('path');
const USE_PERSISTENCE = false;

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
  const strokes = USE_PERSISTENCE ? loadState() : []; 

  return {
    strokes,
    undoneStack: [],
    cursors: {},
  };
}

function handleSocketEvents(io, socket, state) {
  socket.on('draw', (stroke) => {
    stroke.userId = socket.id;
    state.strokes.push(stroke);
    state.undoneStack = []; // Clear redo history after a new draw
    saveState(state);
    io.emit('draw', stroke);
  });

  socket.on('undo', () => {
    if (state.strokes.length === 0) return;
    const undoneStroke = state.strokes.pop();
    state.undoneStack = state.undoneStack || [];
    state.undoneStack.push(undoneStroke);
    saveState(state);
    io.emit('updateCanvas', state.strokes);
  });

  socket.on('redo', () => {
    if (!state.undoneStack || state.undoneStack.length === 0) return;
    const redoStroke = state.undoneStack.pop();
    state.strokes.push(redoStroke);
    saveState(state);
    io.emit('updateCanvas', state.strokes);
  });

  socket.on('clearCanvas', () => {
    state.strokes = [];
    state.undoneStack = [];
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
    delete state.cursors[socket.id];
    socket.broadcast.emit('cursorRemove', socket.id);
  });
}

module.exports = { initDrawingState, handleSocketEvents };
