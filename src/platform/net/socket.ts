import { io, type Socket } from 'socket.io-client';
import type { ClientToServer, ServerToClient } from '../../../shared/protocol';

// Identity = one id per browser tab (sessionStorage): two tabs on one computer are two players, and a
// reload keeps your seat. "Duplicate tab" copies sessionStorage, so tabs that share an id resolve it
// over a BroadcastChannel: the younger tab takes a fresh id and reloads.
const newId = () => Math.random().toString(36).slice(2, 10);
export const clientId = (() => {
  let id = sessionStorage.getItem('clientId');
  if (!id) {
    id = newId();
    sessionStorage.setItem('clientId', id);
  }
  return id;
})();

const born = Date.now() + Math.random();
try {
  const bc = new BroadcastChannel('paper-party-tabs');
  bc.onmessage = (e: MessageEvent<{ id: string; born: number }>) => {
    if (e.data.id !== clientId) return;
    if (e.data.born > born) bc.postMessage({ id: clientId, born }); // tell the younger one
    else if (e.data.born < born) {
      sessionStorage.setItem('clientId', newId());
      location.reload();
    }
  };
  bc.postMessage({ id: clientId, born });
} catch {
  /* no BroadcastChannel: fine */
}

export const socket: Socket<ServerToClient, ClientToServer> = io({ autoConnect: false });
