import { io, type Socket } from 'socket.io-client';

export type ConnectionState = 'idle' | 'connecting' | 'online' | 'offline';

let socket: Socket | null = null;
let state: ConnectionState = 'idle';
const listeners = new Set<(state: ConnectionState) => void>();

function setState(next: ConnectionState) {
  if (state === next) return;
  state = next;
  for (const listener of listeners) listener(state);
}

export function getConnectionState(): ConnectionState {
  return state;
}

export function onConnectionChange(listener: (state: ConnectionState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

/**
 * Opens the shared Socket.IO connection. The auth cookie is sent with the
 * handshake, so no token ever touches JavaScript.
 */
export function connectSocket(): Socket {
  if (socket) return socket;

  const apiBase = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '') || undefined;

  setState('connecting');
  socket = io(apiBase ?? '/', {
    path: '/socket.io',
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
  });

  socket.on('connect', () => setState('online'));
  socket.on('disconnect', () => setState(navigator.onLine ? 'offline' : 'offline'));
  socket.io.on('reconnect_attempt', () => setState('connecting'));
  socket.on('connect_error', () => setState('offline'));

  window.addEventListener('offline', () => setState('offline'));
  window.addEventListener('online', () => {
    if (socket?.connected) setState('online');
    else setState('connecting');
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  setState('idle');
}

/** Joins a ride room so `trip:*` frames are streamed to this tab. */
export function watchRide(rideId: string | null | undefined): () => void {
  const active = socket;
  if (!active || !rideId) return () => undefined;
  active.emit('ride:watch', rideId);
  return () => active.emit('ride:unwatch', rideId);
}
