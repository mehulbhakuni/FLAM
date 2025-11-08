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
