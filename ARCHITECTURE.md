           ┌────────────────────┐
           │     Client A       │
           │  (HTML + Canvas)   │
           └────────┬───────────┘
                    │ WebSocket (Socket.io)
                    ▼
           ┌────────────────────┐
           │   Node.js Server   │
           │  (Express + WS)    │
           │  drawing-state.js  │
           └────────┬───────────┘
                    │ Broadcast
                    ▼
           ┌────────────────────┐
           │     Client B       │
           │  (HTML + Canvas)   │
           └────────────────────┘
