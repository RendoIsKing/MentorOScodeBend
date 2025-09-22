type Event = { type: string; payload: any };
type Subscriber = (e: Event) => void;

class SSEHub {
  private subs = new Map<string, Set<Subscriber>>();

  subscribe(userId: string, fn: Subscriber) {
    const key = String(userId);
    if (!this.subs.has(key)) this.subs.set(key, new Set());
    this.subs.get(key)!.add(fn);
    return () => {
      try { this.subs.get(key)?.delete(fn); } catch {}
    };
  }

  publish(userId: string, e: Event) {
    const key = String(userId);
    try { this.subs.get(key)?.forEach((fn) => fn(e)); } catch {}
  }

  publishMany(userIds: string[], e: Event) {
    for (const id of userIds) this.publish(String(id), e);
  }
}

export const sseHub = new SSEHub();

import { Response } from 'express';

type Client = { userId: string; res: Response };
const clients = new Map<string, Set<Response>>();

export function sseAddClient(userId: string, res: Response) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(res);
}

export function sseRemoveClient(userId: string, res: Response) {
  clients.get(userId)?.delete(res);
}

export function ssePush(userId: string, event: string, data: any) {
  const set = clients.get(userId);
  if (!set) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try { res.write(payload); } catch { /* ignore */ }
  }
}


