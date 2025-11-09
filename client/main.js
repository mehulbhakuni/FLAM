// client/main.js
const colorPicker = document.getElementById('colorPicker');
const brushSizeSlider = document.getElementById('brushSize');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const clearBtn = document.getElementById('clearBtn');
const drawBtn = document.getElementById('drawBtn');
const eraserBtn = document.getElementById('eraserBtn');

colorPicker.addEventListener('input', (e) => color = e.target.value);
brushSizeSlider.addEventListener('input', (e) => brushSize = e.target.value);

undoBtn.addEventListener('click', () => socket.emit('undo'));
redoBtn.addEventListener('click', () => socket.emit('redo'));
clearBtn.addEventListener('click', () => socket.emit('clearCanvas'));

let mode = 'draw';
drawBtn.classList.add('active'); // highlight Draw button by default

drawBtn.addEventListener('click', () => {
  mode = 'draw';
  drawBtn.classList.add('active');
  eraserBtn.classList.remove('active');
});

eraserBtn.addEventListener('click', () => {
  mode = 'erase';
  eraserBtn.classList.add('active');
  drawBtn.classList.remove('active');
});

// client/main.js additions (at bottom of file or merged)
const roomInput = document.getElementById('roomInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');

if (joinRoomBtn) {
  joinRoomBtn.addEventListener('click', () => {
    const room = (roomInput && roomInput.value && roomInput.value.trim()) || 'main';
    if (window.joinRoom) window.joinRoom(room);
    // update UI to indicate current room
    window.currentRoom = room;
    console.log('Joined room', room);
  });
}

// Make current mode accessible globally
window.canvasMode = () => mode;
