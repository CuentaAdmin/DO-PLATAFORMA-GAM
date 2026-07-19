import { io } from 'socket.io-client';

let socket;

export function getSocket() {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_API_URL, { transports: ['websocket', 'polling'] });
  }
  return socket;
}

export function enterRoom(roomCode) {
  const s = getSocket();
  s.emit('room:enter', roomCode);
  return s;
}
