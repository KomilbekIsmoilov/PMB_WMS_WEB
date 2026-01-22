// src/app/socket/usePurchaseDocRoom.ts
'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSocket } from './socketClient';

type JoinAck = { ok: boolean; room?: string; message?: string };

export function usePurchaseDocRoom(docEntry?: number | string | null) {
  const socket = useMemo(() => getSocket(), []);
  const [connected, setConnected] = useState(socket.connected);
  const [room, setRoom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => {
      setConnected(false);
      setRoom(null);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);

  useEffect(() => {
    setError(null);

    const id = Number(docEntry);
    if (!Number.isFinite(id) || id <= 0) return;

    socket.emit('purchaseDoc:join', { DocEntry: id }, (ack: JoinAck) => {
      if (!ack?.ok) {
        setError(ack?.message || 'Join error');
        setRoom(null);
        return;
      }
      setRoom(ack.room || null);
    });

    return () => {
      // Sahifadan chiqishda room’dan chiqib ketadi
      socket.emit('purchaseDoc:leave', (ack: any) => {
        // optional
      });
    };
  }, [socket, docEntry]);

  return { socket, connected, room, error };
}
