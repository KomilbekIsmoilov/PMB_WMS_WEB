'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { getSocket } from './socketClient';

type JoinAck = { ok: boolean; room?: string; message?: string };

export function useBinToBinRoom(docKey?: number | string | null) {
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

    const raw = docKey != null ? String(docKey).trim() : '';
    const idNum = Number(raw);
    const payload =
      raw && Number.isFinite(idNum) && idNum > 0
        ? { DocEntry: idNum }
        : raw
        ? { id: raw }
        : null;

    if (!payload) {
      setRoom(null);
      return;
    }

    socket.emit('binToBin:join', payload, (ack: JoinAck) => {
      if (!ack?.ok) {
        setError(ack?.message || 'Join error');
        setRoom(null);
        return;
      }
      setRoom(ack.room || null);
    });

    return () => {
      socket.emit('binToBin:leave', payload, () => {});
    };
  }, [socket, docKey]);

  return useMemo(() => ({ socket, connected, room, error }), [socket, connected, room, error]);
}
