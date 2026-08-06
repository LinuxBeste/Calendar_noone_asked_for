import { create } from 'zustand'

export interface Toast {
  id: number
  message: string
  kind: 'success' | 'error' | 'info'
}

interface ToastState {
  toasts: Toast[]
  push(message: string, kind?: Toast['kind']): void
  dismiss(id: number): void
}

let nextId = 1

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push(message, kind = 'success') {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, kind }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 4000)
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  }
}))

export function toast(message: string, kind: Toast['kind'] = 'success'): void {
  useToasts.getState().push(message, kind)
}
