import type { WebSocket } from 'ws'

export interface WsPayload {
  type: string
  userId?: string
  calendarId?: string
}

/**
 * Fan-out hub for live updates. Each socket is bound to a user id; a change
 * is only pushed to sockets whose user can read the affected calendar.
 */
export class WsHub {
  private sockets = new Map<WebSocket, string>()

  constructor(private resolveReaders: (calendarId: string) => Promise<string[]>) {}

  add(socket: WebSocket, userId: string): void {
    this.sockets.set(socket, userId)
    socket.on('close', () => {
      this.sockets.delete(socket)
    })
  }

  async broadcast(payload: WsPayload): Promise<void> {
    let readers: Set<string> | null = null
    if (payload.calendarId) {
      readers = new Set(await this.resolveReaders(payload.calendarId))
      if (readers.size === 0 && payload.userId) readers.add(payload.userId)
    }
    const message = JSON.stringify({ type: payload.type })
    for (const [socket, userId] of this.sockets) {
      try {
        if (socket.readyState !== socket.OPEN) {
          this.sockets.delete(socket)
          continue
        }
        const match = readers ? readers.has(userId) : !payload.userId || payload.userId === userId
        if (match) socket.send(message)
      } catch {
        this.sockets.delete(socket)
      }
    }
  }

  get size(): number {
    return this.sockets.size
  }
}
