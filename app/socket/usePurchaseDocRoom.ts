// src/app/socket/usePurchaseDocRoom.ts
'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { getSocket } from './socketClient';

type JoinAck = { ok: boolean; room?: string; message?: string };

export function usePurchaseDocRoom(docEntry?: number | string | null) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const s = await getSocket();
        if (!alive) return;

        setSocket(s);
        setConnected(s.connected);

        const onConnect = () => setConnected(true);
        const onDisconnect = () => {
          setConnected(false);
          setRoom(null);
        };
        const onConnectError = (e: any) => setError(e?.message || 'connect_error');

        s.on('connect', onConnect);
        s.on('disconnect', onDisconnect);
        s.on('connect_error', onConnectError);

        return () => {
          s.off('connect', onConnect);
          s.off('disconnect', onDisconnect);
          s.off('connect_error', onConnectError);
        };
      } catch (e: any) {
        setError(e?.message || 'socket init error');
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    setError(null);

    const id = Number(docEntry);
    if (!Number.isFinite(id) || id <= 0) {
      setRoom(null);
      return;
    }

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

  return useMemo(() => ({ socket, connected, room, error }), [socket, connected, room, error]);
}
