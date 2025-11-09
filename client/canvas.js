// client/canvas.js
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Basic drawing state
let drawing = false;
let color = '#000000';
let brushSize = 3;
let currentPath = [];

// Batching / streaming state
let strokeBuffer = [];
let batchTimer = null;
let tempStrokeId = null;

const colorInput = document.getElementById('colorPicker');
const sizeInput = document.getElementById('brushSize');
if (colorInput) colorInput.addEventListener('input', (e) => color = e.target.value);
if (sizeInput) sizeInput.addEventListener('input', (e) => brushSize = parseInt(e.target.value, 10));

// Event listeners for drawing
canvas.addEventListener('mousedown', startDraw);
canvas.addEventListener('mousemove', handlePointerMove); // handles both draw & cursor
canvas.addEventListener('mouseup', endDraw);
canvas.addEventListener('mouseleave', endDraw);

function currentMode() {
  return window.canvasMode ? window.canvasMode() : 'draw';
}

function startDraw(e) {
  drawing = true;
  currentPath = [{ x: e.offsetX, y: e.offsetY }];
  strokeBuffer = [{ x: e.offsetX, y: e.offsetY }];
  tempStrokeId = Date.now(); // temporary id used during streaming
}

function handlePointerMove(e) {
  // cursor emission happens even when not drawing
  if (window.socket) {
    window.socket.emit('cursorMove', { x: e.offsetX, y: e.offsetY });
  }

  // If drawing, use the optimized draw handler
  if (!drawing) return;
  optimizedDraw(e);
}

// Optimized draw with local prediction and batching
function optimizedDraw(e) {
  const point = { x: e.offsetX, y: e.offsetY };
  const last = currentPath[currentPath.length - 1] || point;

  const mode = currentMode();

  // Local prediction: draw immediately on local canvas
  drawLineSegment(last, point, color, brushSize, mode);

  // Push to current path & buffer
  currentPath.push(point);
  strokeBuffer.push(point);

  // Batch send every X ms (adjustable)
  if (!batchTimer) {
    batchTimer = setTimeout(() => {
      if (strokeBuffer.length > 1 && window.socket) {
        const stroke = {
          id: tempStrokeId || Date.now(),
          timestamp: Date.now(),
          userId: window.socket.id,
          path: [...strokeBuffer],
          color,
          width: brushSize,
          type: mode,
          isPartial: true
        };
        window.socket.emit('draw', stroke);
        strokeBuffer = [];
      }
      batchTimer = null;
    }, 50); // 50 ms default
  }
}

function endDraw() {
  if (!drawing || currentPath.length < 2) {
    drawing = false;
    currentPath = [];
    strokeBuffer = [];
    tempStrokeId = null;
    return;
  }
  drawing = false;

  const mode = currentMode();
  const stroke = {
    id: tempStrokeId || Date.now(),
    timestamp: Date.now(),
    userId: window.socket?.id,
    path: currentPath,
    color,
    width: brushSize,
    type: mode,
    isPartial: false
  };

  // Send final stroke to server
  if (window.socket) window.socket.emit('draw', stroke);

  // reset buffers
  currentPath = [];
  strokeBuffer = [];
  tempStrokeId = null;
}

// Canvas drawing primitives
function drawLineSegment(start, end, colorVal, width, type = 'draw') {
  if (!start || !end) return;
  if (type === 'erase') {
    ctx.globalCompositeOperation = 'destination-out';
  } else {
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.strokeStyle = colorVal;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  ctx.globalCompositeOperation = 'source-over';
}

function redrawCanvas(strokes) {
  // full redraw of given strokes (used on updateCanvas)
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const stroke of strokes) {
    const type = stroke.type || 'draw';
    for (let i = 1; i < stroke.path.length; i++) {
      drawLineSegment(stroke.path[i - 1], stroke.path[i], stroke.color, stroke.width, type);
    }
  }
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

window.canvasAPI = { drawLineSegment, redrawCanvas, clearCanvas };

const cursorLayer = document.createElement('canvas');
cursorLayer.className = 'cursor-overlay';
const appContainer = document.getElementById('app-container') || document.body;

// set initial sizes and append overlay inside container so positioning is stable
function syncCursorLayer() {
  // ensure overlay matches the main canvas size and position relative to container
  const rect = canvas.getBoundingClientRect();
  cursorLayer.width = canvas.width;
  cursorLayer.height = canvas.height;
  cursorLayer.style.position = 'absolute';
  cursorLayer.style.left = `${rect.left + window.scrollX}px`;
  cursorLayer.style.top = `${rect.top + window.scrollY}px`;
  cursorLayer.style.pointerEvents = 'none';
  cursorLayer.style.zIndex = 9999;
}
document.body.appendChild(cursorLayer);
syncCursorLayer();
window.addEventListener('resize', syncCursorLayer);
window.addEventListener('scroll', syncCursorLayer);

const cursorCtx = cursorLayer.getContext('2d');
const cursors = {}; // { userId: {x, y, color, label, lastActiveTs} }

// utility to draw cursors and labels
function drawCursors() {
  cursorCtx.clearRect(0, 0, cursorLayer.width, cursorLayer.height);
  const now = Date.now();

  Object.entries(cursors).forEach(([id, data]) => {
    // skip if stale (optional fade/out) - we'll keep visible but you can implement fade
    const { x, y, color: c, label } = data;

    // Draw cursor dot
    cursorCtx.beginPath();
    cursorCtx.arc(x, y, 5, 0, Math.PI * 2);
    cursorCtx.fillStyle = c;
    cursorCtx.fill();
    cursorCtx.lineWidth = 2;
    cursorCtx.strokeStyle = '#fff';
    cursorCtx.stroke();

    // Draw label
    cursorCtx.font = '12px "Segoe UI", Roboto, Arial';
    cursorCtx.textAlign = 'center';
    cursorCtx.textBaseline = 'bottom';
    cursorCtx.fillStyle = c;
    cursorCtx.fillText(label || id.slice(0, 5), x, y - 10);
  });

  requestAnimationFrame(drawCursors);
}
drawCursors();

// Assign random pastel color for new users (deterministic assignment could be added)
function randomColor() {
  const colors = ['#f87171', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f472b6'];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Handle cursor events from server
if (window.socket) {
  // initial canvas when joining
  window.socket.on('initCanvas', (strokes) => {
    // save strokes locally and redraw
    window.allStrokes = strokes || [];
    window.canvasAPI.redrawCanvas(window.allStrokes);
  });

  // real-time draw events (partial or full)
  window.socket.on('draw', (stroke) => {
    if (stroke.isPartial) {
      // append to allStrokes if last stroke belongs to same user and is partial
      window.allStrokes = window.allStrokes || [];
      const last = window.allStrokes[window.allStrokes.length - 1];
      if (last && last.userId === stroke.userId && last.isPartial) {
        last.path.push(...stroke.path);
      } else {
        window.allStrokes.push(stroke);
      }
      // locally draw the new segments
      for (let i = 1; i < stroke.path.length; i++) {
        window.canvasAPI.drawLineSegment(stroke.path[i - 1], stroke.path[i], stroke.color, stroke.width, stroke.type);
      }
      return;
    }

    // Completed stroke: append and draw
    window.allStrokes = window.allStrokes || [];
    window.allStrokes.push(stroke);
    for (let i = 1; i < stroke.path.length; i++) {
      window.canvasAPI.drawLineSegment(stroke.path[i - 1], stroke.path[i], stroke.color, stroke.width, stroke.type);
    }
  });

  // Full canvas updates (undo/redo/clear)
  window.socket.on('updateCanvas', (strokes) => {
    window.allStrokes = strokes || [];
    window.canvasAPI.redrawCanvas(window.allStrokes);
  });

  window.socket.on('clearCanvas', () => {
    window.allStrokes = [];
    window.canvasAPI.clearCanvas();
  });

  // Cursor updates
  window.socket.on('cursorMove', ({ userId, pos }) => {
    if (!cursors[userId]) {
      cursors[userId] = {
        x: pos.x,
        y: pos.y,
        color: randomColor(),
        label: window.userLabels?.[userId] || ('User-' + userId.slice(0, 4)),
        lastActiveTs: Date.now()
      };
    } else {
      cursors[userId].x = pos.x;
      cursors[userId].y = pos.y;
      cursors[userId].lastActiveTs = Date.now();
    }
  });

  window.socket.on('cursorRemove', (userId) => {
    delete cursors[userId];
  });

  // User list update (optionally maintain labels)
  window.socket.on('userListUpdate', (users) => {
    const list = document.getElementById('userList');
    if (list) {
      list.innerHTML = '';
      users.forEach((id, idx) => {
        const li = document.createElement('li');
        const label = `User-${idx + 1}`;
        li.textContent = label;
        list.appendChild(li);
        // keep consistent label mapping
        if (!window.userLabels) window.userLabels = {};
        if (!window.userLabels[id]) window.userLabels[id] = label;
      });
    }
  });
}

// Expose some globals for other modules
window.canvasAPI = window.canvasAPI || { drawLineSegment, redrawCanvas, clearCanvas };

