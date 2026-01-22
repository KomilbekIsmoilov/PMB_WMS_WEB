'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { getSocket } from './socketClient';

export function useOrderPickRoom(docEntry: number | null) {
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
        const onDisconnect = () => setConnected(false);
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

    if (!docEntry) {
      setRoom(null);
      return;
    }

    socket.emit('orderPick:joinDoc', { DocEntry: docEntry }, (ack: any) => {
      if (!ack?.ok) {
        setError(ack?.message || 'join error');
        return;
      }
      setRoom(ack?.room || `orderpick:${docEntry}`);
    });

    return () => {
      socket.emit('orderPick:leaveDoc', { DocEntry: docEntry }, () => {});
    };
  }, [socket, docEntry]);

  return useMemo(
    () => ({ socket, connected, room, error }),
    [socket, connected, room, error]
  );
}
