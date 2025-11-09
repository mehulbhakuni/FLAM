// client/canvas.js
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let drawing = false;
let color = '#000000';
let brushSize = 3;
let currentPath = [];

canvas.addEventListener('mousedown', startDraw);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', endDraw);
canvas.addEventListener('mouseleave', endDraw);

function startDraw(e) {
  drawing = true;
  currentPath = [{ x: e.offsetX, y: e.offsetY }];
}

function draw(e) {
  if (!drawing) return;

  const point = { x: e.offsetX, y: e.offsetY };
  const last = currentPath[currentPath.length - 1];

  const mode = window.canvasMode ? window.canvasMode() : 'draw';
  drawLineSegment(last, point, color, brushSize, mode);

  currentPath.push(point);
}

function endDraw() {
  if (!drawing || currentPath.length < 2) return;
  drawing = false;

  const mode = window.canvasMode ? window.canvasMode() : 'draw';
  const stroke = {
    id: Date.now(),
    path: currentPath,
    color,
    width: brushSize,
    type: mode  
  };

  if (window.socket) window.socket.emit('draw', stroke);
  currentPath = [];
}

// Updated draw function that handles erase type
function drawLineSegment(start, end, color, width, type = 'draw') {
  if (type === 'erase') {
    ctx.globalCompositeOperation = 'destination-out';
  } else {
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  ctx.globalCompositeOperation = 'source-over'; // reset after stroke
}

function redrawCanvas(strokes) {
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

// Maintain other users' cursors
const cursorLayer = document.createElement('canvas');
cursorLayer.width = canvas.width;
cursorLayer.height = canvas.height;
cursorLayer.style.position = 'absolute';
cursorLayer.style.left = canvas.offsetLeft + 'px';
cursorLayer.style.top = canvas.offsetTop + 'px';
cursorLayer.style.pointerEvents = 'none'; 
cursorLayer.style.zIndex = 10;
document.body.appendChild(cursorLayer);

const cursorCtx = cursorLayer.getContext('2d');
const cursors = {}; // { userId: {x, y, color} }

// Track local cursor movement
canvas.addEventListener('mousemove', (e) => {
  if (window.socket) {
    window.socket.emit('cursorMove', { x: e.offsetX, y: e.offsetY });
  }
});

// Draw cursors for other users
function drawCursors() {
  cursorCtx.clearRect(0, 0, cursorLayer.width, cursorLayer.height);
  Object.entries(cursors).forEach(([id, { x, y, color }]) => {
    cursorCtx.beginPath();
    cursorCtx.arc(x, y, 5, 0, 2 * Math.PI);
    cursorCtx.fillStyle = color;
    cursorCtx.fill();
    cursorCtx.strokeStyle = '#fff';
    cursorCtx.lineWidth = 2;
    cursorCtx.stroke();
  });
  requestAnimationFrame(drawCursors);
}
drawCursors();

// Listen for server cursor updates
if (window.socket) {
  window.socket.on('cursorMove', ({ userId, pos }) => {
    if (!cursors[userId]) {
      cursors[userId] = { ...pos, color: randomColor() };
    } else {
      cursors[userId].x = pos.x;
      cursors[userId].y = pos.y;
    }
  });

  window.socket.on('cursorRemove', (userId) => {
    delete cursors[userId];
  });
}

// Random pastel colors for each user cursor
function randomColor() {
  const colors = ['#f87171', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f472b6'];
  return colors[Math.floor(Math.random() * colors.length)];
}
