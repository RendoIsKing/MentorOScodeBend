/**
 * Realtime hub — now wraps Supabase Realtime for server-side event publishing.
 *
 * The legacy SSE client connections are removed. Instead:
 * - The frontend subscribes to Supabase Realtime channels directly.
 * - The backend publishes events by inserting rows into tables (which triggers
 *   Supabase Realtime postgres_changes) or by using Supabase Realtime Broadcast.
 *
 * For backward compatibility, the old SSEHub API is preserved as a thin wrapper
 * that publishes via Supabase Realtime Broadcast channels.
 */
import { supabaseAdmin } from "./supabase";
import type { Response } from "express";

type Event = { type: string; payload: any };
type Subscriber = (e: Event) => void;

class SSEHub {
  private subs = new Map<string, Set<Subscriber>>();

  subscribe(userId: string, fn: Subscriber) {
    const key = String(userId);
    if (!this.subs.has(key)) this.subs.set(key, new Set());
    this.subs.get(key)!.add(fn);
    return () => {
      try {
        this.subs.get(key)?.delete(fn);
      } catch {}
    };
  }

  /**
   * Publish an event to a specific user via Supabase Realtime Broadcast.
   * Also notifies any local subscribers (for backward compat during migration).
   */
  async publish(userId: string, e: Event) {
    const key = String(userId);
    // Local subscribers
    try {
      this.subs.get(key)?.forEach((fn) => fn(e));
    } catch {}

    // Supabase Realtime Broadcast
    try {
      const channel = supabaseAdmin.channel(`user:${key}`);
      await channel.send({
        type: "broadcast",
        event: e.type,
        payload: e.payload,
      });
      supabaseAdmin.removeChannel(channel);
    } catch (err) {
      // Non-fatal: the user might not be connected
    }
  }

  async publishMany(userIds: string[], e: Event) {
    await Promise.allSettled(
      userIds.map((id) => this.publish(String(id), e)),
    );
  }
}

export const sseHub = new SSEHub();

// ── Legacy SSE client management ─────────────────────────────────────────────
// These are kept temporarily for any remaining SSE endpoints during migration.
// They will be removed in Phase 7.

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
    try {
      res.write(payload);
    } catch {
      /* ignore */
    }
  }

  // Also broadcast via Supabase Realtime
  sseHub.publish(userId, { type: event, payload: data }).catch(() => {});
}

/** Check which user IDs have at least one active connection. */
export function getOnlineUserIds(userIds: string[]): string[] {
  return userIds.filter((id) => {
    const set = clients.get(id);
    return set && set.size > 0;
  });
}
