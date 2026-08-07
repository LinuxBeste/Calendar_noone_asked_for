interface PointerDragHandlers {
  /** Called when the drag gesture is claimed (immediately for mouse, after a long-press for touch). */
  onClaim(): void
  onMove(clientX: number, clientY: number): void
  onEnd(clientX: number, clientY: number): void
  onCancel(): void
  threshold?: number
  longPressMs?: number
}

interface PointerDragSession {
  cancel(): void
}

/**
 * Pointer-based drag helper that works with mouse, pen and touch.
 * - Mouse/pen: claims the gesture immediately on pointerdown.
 * - Touch: waits for a long-press (default 300ms) without movement, then claims
 *   the gesture and blocks scrolling for its duration. If the finger moves
 *   beyond the threshold first, the gesture is abandoned (native scroll).
 * The caller is expected to have `touch-action: none` on elements that should
 * start a drag immediately on touch (e.g. event chips).
 */
export function attachPointerDrag(
  el: HTMLElement,
  pointerId: number,
  pointerType: string,
  startClientX: number,
  startClientY: number,
  handlers: PointerDragHandlers
): PointerDragSession {
  const threshold = handlers.threshold ?? 6
  const longPressMs = handlers.longPressMs ?? 300
  let claimed = false
  let startX = 0
  let startY = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let blocker: ((ev: TouchEvent) => void) | null = null
  let done = false

  const cleanupListeners = (): void => {
    if (blocker) {
      el.removeEventListener('touchmove', blocker)
      blocker = null
    }
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
  }

  const claim = (): void => {
    if (claimed || done) return
    claimed = true
    if (el.setPointerCapture) {
      try {
        el.setPointerCapture(pointerId)
      } catch {
        // pointer may already be gone
      }
    }
    handlers.onClaim()
  }

  const finish = (): void => {
    if (done) return
    done = true
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    cleanupListeners()
  }

  const onMove = (ev: PointerEvent): void => {
    if (done) return
    if (claimed) {
      ev.preventDefault()
      handlers.onMove(ev.clientX, ev.clientY)
      return
    }
    if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > threshold) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      // finger moved before the long-press — let the browser scroll
      finish()
    }
  }

  const onUp = (ev: PointerEvent): void => {
    if (done) return
    finish()
    if (claimed) handlers.onEnd(ev.clientX, ev.clientY)
  }

  const onCancel = (): void => {
    if (done) return
    finish()
    handlers.onCancel()
  }

  startX = startClientX
  startY = startClientY
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)

  if (pointerType === 'touch') {
    blocker = (ev: TouchEvent): void => {
      if (claimed) ev.preventDefault()
    }
    el.addEventListener('touchmove', blocker, { passive: false })
    timer = setTimeout(claim, longPressMs)
  } else {
    claim()
  }

  return {
    cancel(): void {
      finish()
      handlers.onCancel()
    }
  }
}
