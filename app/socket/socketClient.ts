// src/app/socket/socketClient.ts
'use client';

import type { Socket } from 'socket.io-client';

let _socket: Socket | null = null;
let _loading: Promise<Socket> | null = null;

export async function getSocket(): Promise<Socket> {
  if (typeof window === 'undefined') {
    throw new Error('getSocket() must be called in the browser');
  }

  if (_socket) return _socket;
  if (_loading) return _loading;

  _loading = (async () => {
    const mod = await import('socket.io-client');
    const io = mod.io;

    const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;

    const s = io(url as any, {
      path: process.env.NEXT_PUBLIC_SOCKET_PATH || '/socket.io',
      transports: ['websocket'], 
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
    });

    _socket = s;
    return s;
  })();

  return _loading;
}
