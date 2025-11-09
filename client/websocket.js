// client/websocket.js
const socket = io();
window.socket = socket;
window.currentRoom = 'main';
window.allStrokes = [];

// auto-join default room on connect
socket.on('connect', () => {
  console.log('Connected to server:', socket.id);
  // join default room
  socket.emit('joinRoom', window.currentRoom);
});

// Public helper: switch room
window.joinRoom = (roomName) => {
  if (!roomName) return;
  // clear local canvas to avoid mixing strokes from previous room
  window.allStrokes = [];
  window.canvasAPI && window.canvasAPI.clearCanvas && window.canvasAPI.clearCanvas();
  window.currentRoom = roomName;
  socket.emit('joinRoom', roomName);
};

// init canvas for the room
socket.on('initCanvas', (strokes) => {
  window.allStrokes = strokes || [];
  if (window.canvasAPI && window.canvasAPI.redrawCanvas) {
    window.canvasAPI.redrawCanvas(window.allStrokes);
  }
});

// draw event (partial or full stroke)
socket.on('draw', (stroke) => {
  // Handle incremental merged partials or full strokes
  if (!stroke) return;
  // If stroke.isPartial -> appended segments are expected
  if (stroke.isPartial) {
    window.allStrokes = window.allStrokes || [];
    const last = window.allStrokes[window.allStrokes.length - 1];
    if (last && last.userId === stroke.userId && last.isPartial) {
      last.path.push(...stroke.path);
    } else {
      window.allStrokes.push(stroke);
    }
    // render incremental segments
    for (let i = 1; i < stroke.path.length; i++) {
      window.canvasAPI.drawLineSegment(stroke.path[i - 1], stroke.path[i], stroke.color, stroke.width, stroke.type);
    }
    return;
  }

  // completed stroke: append and draw
  window.allStrokes = window.allStrokes || [];
  window.allStrokes.push(stroke);
  for (let i = 1; i < stroke.path.length; i++) {
    window.canvasAPI.drawLineSegment(stroke.path[i - 1], stroke.path[i], stroke.color, stroke.width, stroke.type);
  }
});

// updateCanvas (full canvas replacement)
socket.on('updateCanvas', (strokes) => {
  window.allStrokes = strokes || [];
  window.canvasAPI.redrawCanvas(window.allStrokes);
});

// clear canvas
socket.on('clearCanvas', () => {
  window.allStrokes = [];
  window.canvasAPI.clearCanvas();
});

// user list update for current room
socket.on('userListUpdate', (users) => {
  const list = document.getElementById('userList');
  if (list) {
    list.innerHTML = '';
    users.forEach((id, idx) => {
      const li = document.createElement('li');
      const label = `User-${idx + 1}`;
      li.textContent = label;
      list.appendChild(li);
      if (!window.userLabels) window.userLabels = {};
      if (!window.userLabels[id]) window.userLabels[id] = label;
    });
  }
});

// cursor moves and removal are forwarded unchanged
socket.on('cursorMove', (data) => {
  // forwarded to canvas.js handlers which listen on window.socket
  // no-op here
});

socket.on('cursorRemove', (id) => {
  // forwarded to canvas.js handlers (no-op here)
});

// reconnect handling: rejoin current room and request canvas state
socket.on('reconnect', (attempt) => {
  console.log('Reconnected after', attempt);
  socket.emit('joinRoom', window.currentRoom);
  socket.emit('requestCanvasState');
});
