// server/drawing-state.js
const fs = require('fs');
const path = require('path');

const USE_PERSISTENCE = process.env.PERSIST === 'true';
const STATE_DIR = __dirname; // change if you want another folder

// Save strokes persistently (per-room)
function saveState(state, room = 'main') {
  try {
    if (!USE_PERSISTENCE) return;
    const STATE_FILE = path.join(STATE_DIR, `${room}_canvasState.json`);
    fs.writeFileSync(STATE_FILE, JSON.stringify(state.strokes, null, 2));
  } catch (err) {
    console.error('Error saving canvas state:', err);
  }
}

// Load previous strokes (per-room)
function loadState(room = 'main') {
  try {
    if (!USE_PERSISTENCE) return [];
    const STATE_FILE = path.join(STATE_DIR, `${room}_canvasState.json`);
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading saved state:', err);
  }
  return [];
}

function initDrawingState(room = 'main') {
  const strokes = USE_PERSISTENCE ? loadState(room) : [];

  return {
    strokes,
    undoneStack: [],
    cursors: {},
  };
}

// Helper: bounding box of a stroke path
function boundingBox(path) {
  if (!path || !path.length) return { x1: 0, x2: 0, y1: 0, y2: 0 };
  const xs = path.map(p => p.x);
  const ys = path.map(p => p.y);
  return {
    x1: Math.min(...xs),
    x2: Math.max(...xs),
    y1: Math.min(...ys),
    y2: Math.max(...ys)
  };
}

// Helper: check if two strokes' bounding boxes overlap
function overlaps(s1, s2) {
  if (!s1 || !s2) return false;
  const box1 = boundingBox(s1.path);
  const box2 = boundingBox(s2.path);
  return !(
    box1.x2 < box2.x1 ||
    box1.x1 > box2.x2 ||
    box1.y2 < box2.y1 ||
    box1.y1 > box2.y2
  );
}

/**
 * handleSocketEvents(io, socket, state)
 * - io: socket.io server instance
 * - socket: socket for this client
 * - state: the room-specific drawing state object
 *
 * All broadcasts are scoped to the socket's currentRoom (socket.currentRoom).
 */
function handleSocketEvents(io, socket, state) {
  // Helper: room where this socket is active
  function room() {
    return socket.currentRoom || 'main';
  }

  socket.on('draw', (stroke) => {
    const r = room();
    stroke.userId = socket.id;
    stroke.timestamp = stroke.timestamp || Date.now();

    // Merge partial strokes for same user (streaming/batching)
    if (stroke.isPartial) {
      const lastStroke = state.strokes[state.strokes.length - 1];
      if (lastStroke && lastStroke.userId === socket.id && lastStroke.isPartial) {
        lastStroke.path.push(...stroke.path);
        lastStroke.timestamp = Math.max(lastStroke.timestamp || 0, stroke.timestamp);
        // broadcast to others in same room
        io.in(r).emit('draw', { ...stroke, merged: true });
        saveState(state, r);
        return;
      }
    }

    // Treat eraser as a drawing operation (pixel-based)
    if (stroke.type === 'erase') {
      // Append erase stroke like other strokes (clients render with destination-out)
      const insertIndex = state.strokes.findIndex(s => (s.timestamp || 0) > stroke.timestamp);
      if (insertIndex === -1) {
        state.strokes.push(stroke);
      } else {
        state.strokes.splice(insertIndex, 0, stroke);
      }
      state.undoneStack = [];
      saveState(state, r);
      io.in(r).emit('draw', stroke);
      return;
    }

    // Insert stroke based on timestamp to keep deterministic order
    const insertIndex = state.strokes.findIndex(s => (s.timestamp || 0) > stroke.timestamp);
    if (insertIndex === -1) {
      state.strokes.push(stroke);
    } else {
      state.strokes.splice(insertIndex, 0, stroke);
    }

    state.undoneStack = [];
    saveState(state, r);
    io.in(r).emit('draw', stroke);
  });

  socket.on('undo', () => {
    const r = room();
    if (state.strokes.length === 0) return;
    const undoneStroke = state.strokes.pop();
    state.undoneStack = state.undoneStack || [];
    state.undoneStack.push(undoneStroke);
    saveState(state, r);
    io.in(r).emit('updateCanvas', state.strokes);
  });

  socket.on('redo', () => {
    const r = room();
    if (!state.undoneStack || state.undoneStack.length === 0) return;
    const redoStroke = state.undoneStack.pop();
    state.strokes.push(redoStroke);
    saveState(state, r);
    io.in(r).emit('updateCanvas', state.strokes);
  });

  socket.on('clearCanvas', () => {
    const r = room();
    state.strokes = [];
    state.undoneStack = [];
    saveState(state, r);
    io.in(r).emit('clearCanvas');
  });

  socket.on('cursorMove', (pos) => {
    const r = room();
    state.cursors[socket.id] = pos;
    socket.to(r).emit('cursorMove', { userId: socket.id, pos });
  });

  // When a client explicitly requests the room's canvas
  socket.on('requestCanvasState', () => {
    const r = room();
    socket.emit('canvasState', state.strokes);
  });

  socket.on('disconnect', () => {
    const r = room();
    delete state.cursors[socket.id];
    socket.to(r).emit('cursorRemove', socket.id);
  });
}

module.exports = { initDrawingState, handleSocketEvents };
