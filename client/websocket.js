// client/websocket.js
const socket = io();
window.socket = socket;

let allStrokes = [];

// Initial data
socket.on('initCanvas', (strokes) => {
  allStrokes = strokes;
  window.canvasAPI.redrawCanvas(allStrokes);
});

// New stroke broadcast
socket.on('draw', (stroke) => {
  allStrokes.push(stroke);
  const type = stroke.type || 'draw';

  for (let i = 1; i < stroke.path.length; i++) {
    window.canvasAPI.drawLineSegment(
      stroke.path[i - 1],
      stroke.path[i],
      stroke.color,
      stroke.width,
      type
    );
  }
});

// Undo/Redo update
socket.on('updateCanvas', (strokes) => {
  allStrokes = strokes;
  window.canvasAPI.redrawCanvas(allStrokes);
});

// Clear canvas
socket.on('clearCanvas', () => {
  allStrokes = [];
  window.canvasAPI.clearCanvas();
});

// Update user list
socket.on('userListUpdate', (users) => {
  const list = document.getElementById('userList');
  list.innerHTML = '';
  users.forEach((id) => {
    const li = document.createElement('li');
    li.textContent = id;
    list.appendChild(li);
  });
});

// When connection is lost
socket.on('disconnect', () => {
  console.warn('Disconnected from server...');
});

// When reconnected
socket.on('connect', () => {
  console.log('Reconnected to server!');
  // Re-request canvas (in case initCanvas wasn't auto-sent)
  socket.emit('requestCanvasState');
});

// Custom event if server supports manual state request
socket.on('canvasState', (strokes) => {
  allStrokes = strokes || [];
  window.canvasAPI.redrawCanvas(allStrokes);
  console.log('Canvas restored after reconnect');
});
