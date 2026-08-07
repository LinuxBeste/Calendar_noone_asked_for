import type { WebSocket } from 'ws'

export class WsHub {
  private sockets = new Set<WebSocket>()

  add(socket: WebSocket): void {
    this.sockets.add(socket)
    socket.on('close', () => {
      this.sockets.delete(socket)
    })
  }

  broadcast(payload: unknown): void {
    const message = JSON.stringify(payload)
    for (const socket of this.sockets) {
      try {
        if (socket.readyState === socket.OPEN) socket.send(message)
      } catch {
        this.sockets.delete(socket)
      }
    }
  }

  get size(): number {
    return this.sockets.size
  }
}
