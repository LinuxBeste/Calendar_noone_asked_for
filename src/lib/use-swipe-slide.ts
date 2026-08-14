import { useEffect, useMemo, useRef, useState } from 'react'
import { useCalendar } from '../store'

const SLIDE_MS = 200

type SlideAnim = { dir: 1 | -1; stage: 'exit' | 'enter' }

/**
 * Horizontal swipe navigation with a slide-out / slide-in animation.
 * Attach `slideRef` to the element that should slide, and style it with
 * `slideStyle`. Swipes starting on buttons/chips are ignored so that
 * drag-and-drop keeps working. Navigating a period backwards with the
 * toolbar or the keyboard (which bypasses this hook) still navigates,
 * only without the slide.
 */
export function useSwipeSlide(suppressClickRef: React.RefObject<boolean>): {
  slide: SlideAnim | null
  slideRef: React.RefObject<HTMLDivElement | null>
  slideStyle: React.CSSProperties
} {
  const [slide, setSlide] = useState<SlideAnim | null>(null)
  const slideRef = useRef<HTMLDivElement>(null)
  const slideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const el = slideRef.current
    if (!el) return
    if (!window.matchMedia('(pointer: coarse)').matches) return
    let startX = 0
    let startY = 0
    let pointerId = 0
    let tracking = false
    const onDown = (e: PointerEvent): void => {
      if (e.pointerType !== 'touch') return
      if ((e.target as HTMLElement).closest('button, .rounded-md')) return
      if (tracking && e.pointerId !== pointerId) {
        tracking = false
        return
      }
      tracking = true
      pointerId = e.pointerId
      startX = e.clientX
      startY = e.clientY
    }
    const onMove = (e: PointerEvent): void => {
      if (!tracking || e.pointerId !== pointerId) return
      if (e.pointerType !== 'touch') return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy) * 1.3) return
      tracking = false
      e.preventDefault()
      suppressClickRef.current = true
      setSlide({ dir: dx < 0 ? 1 : -1, stage: 'exit' })
    }
    const onEnd = (e: PointerEvent): void => {
      if (e.pointerId === pointerId) tracking = false
    }
    const onWindowCancel = (): void => {
      tracking = false
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd, true)
    window.addEventListener('pointercancel', onWindowCancel, true)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd, true)
      window.removeEventListener('pointercancel', onWindowCancel, true)
    }
  }, [suppressClickRef])

  // Swipe slide animation: slide the current period out, navigate, slide the next one in.
  useEffect(() => {
    if (!slide) return
    if (slide.stage === 'exit') {
      slideTimer.current = setTimeout(() => {
        useCalendar.getState().navigate(slide.dir)
        setSlide({ dir: slide.dir, stage: 'enter' })
      }, SLIDE_MS)
    } else {
      slideTimer.current = setTimeout(() => setSlide(null), SLIDE_MS + 60)
    }
    return () => {
      if (slideTimer.current) clearTimeout(slideTimer.current)
    }
  }, [slide])

  const slideStyle: React.CSSProperties = useMemo(() => {
    if (!slide) return {}
    if (slide.stage === 'exit') {
      return {
        transform: `translateX(${slide.dir * 100}%)`,
        opacity: 0,
        transition: `transform ${SLIDE_MS}ms ease-in, opacity ${SLIDE_MS}ms ease-in`,
        willChange: 'transform, opacity'
      }
    }
    return {
      transform: 'translateX(0%)',
      opacity: 1,
      transition: `transform ${SLIDE_MS + 60}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${SLIDE_MS + 60}ms ease-out`,
      willChange: 'transform, opacity'
    }
  }, [slide])

  return { slide, slideRef, slideStyle }
}
