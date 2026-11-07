// Estado visível da sala atual: participantes, cursores, papel e conexão.
import { createStore, useStore } from 'zustand';
import type { MapPoint } from '../coordinates';

export type RoomRole = 'admin' | 'editor' | 'viewer';
export type ConnectionState = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'offline';

export const ROLE_LABEL: Record<RoomRole, string> = {
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Espectador',
};

export interface Peer {
  clientId: string;
  userId: string;
  name: string;
  color: string;
  role: RoomRole;
  cursor: MapPoint | null;
}

export interface RoomState {
  active: boolean;
  roomId: string | null;
  inviteCode: string | null;
  transportKind: 'supabase' | 'local' | null;
  clientId: string | null;
  role: RoomRole | null;
  connection: ConnectionState;
  peers: Peer[];
  pendingOps: number;
}

export const initialRoomState = (): RoomState => ({
  active: false,
  roomId: null,
  inviteCode: null,
  transportKind: null,
  clientId: null,
  role: null,
  connection: 'idle',
  peers: [],
  pendingOps: 0,
});

export const roomStore = createStore<RoomState>(() => initialRoomState());

export const useRoom = <T,>(selector: (state: RoomState) => T): T => useStore(roomStore, selector);
