// server/drawing-state.js
const fs = require('fs');
const path = require('path');

const USE_PERSISTENCE = process.env.PERSIST === 'true';
const STATE_FILE = path.join(__dirname, 'canvasState.json');

// Save strokes persistently (optional resilience)
function saveState(state) {
  try {
    if (!USE_PERSISTENCE) return; // don't write if persistence disabled
    fs.writeFileSync(STATE_FILE, JSON.stringify(state.strokes, null, 2));
  } catch (err) {
    console.error('Error saving canvas state:', err);
  }
}

// Load previous strokes (optional)
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE) && USE_PERSISTENCE) {
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

function handleSocketEvents(io, socket, state) {
  socket.on('draw', (stroke) => {
    // Ensure required fields
    stroke.userId = socket.id;
    stroke.timestamp = stroke.timestamp || Date.now();

    // If this is a partial (streamed) update, try to merge with last partial stroke from same user
    if (stroke.isPartial) {
      const lastStroke = state.strokes[state.strokes.length - 1];
      if (lastStroke && lastStroke.userId === socket.id && lastStroke.isPartial) {
        // Merge paths
        lastStroke.path.push(...stroke.path);
        lastStroke.timestamp = Math.max(lastStroke.timestamp || 0, stroke.timestamp);
        // Broadcast incremental update (clients can choose to append)
        io.emit('draw', { ...stroke, merged: true });
        saveState(state);
        return;
      }
    }

    // Erase behaves like drawing (pixel-based), so just broadcast it normally
    if (stroke.type === 'erase') {
      state.strokes.push(stroke);
      state.undoneStack = [];
      saveState(state);
      io.emit('draw', stroke);
      return;
    }

    // Insert stroke based on timestamp to keep deterministic order (oldest first)
    const insertIndex = state.strokes.findIndex(s => (s.timestamp || 0) > stroke.timestamp);
    if (insertIndex === -1) {
      state.strokes.push(stroke);
    } else {
      state.strokes.splice(insertIndex, 0, stroke);
    }

    // New draw clears redo stack
    state.undoneStack = [];
    saveState(state);

    // Broadcast new stroke (clients will append or redraw as needed)
    io.emit('draw', stroke);
  });

  socket.on('undo', () => {
    if (state.strokes.length === 0) return;
    // Pop the last stroke globally
    const undoneStroke = state.strokes.pop();
    state.undoneStack = state.undoneStack || [];
    state.undoneStack.push(undoneStroke);
    saveState(state);
    // Send updated strokes list to all clients
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
    // store simple cursor (x,y) for this socket and broadcast to others
    state.cursors[socket.id] = pos;
    socket.broadcast.emit('cursorMove', { userId: socket.id, pos });
  });

  socket.on('requestCanvasState', () => {
    // Send full canvas state to the requester (useful on reconnect)
    socket.emit('canvasState', state.strokes);
  });

  socket.on('disconnect', () => {
    // remove cursor and notify others
    delete state.cursors[socket.id];
    socket.broadcast.emit('cursorRemove', socket.id);
  });
}

module.exports = { initDrawingState, handleSocketEvents };
