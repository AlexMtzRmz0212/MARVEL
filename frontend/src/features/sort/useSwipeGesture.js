import { useRef, useState } from 'react'

import { decideSwipe } from './swipe'

/** Only the last stretch of a drag says how fast it was released. */
const VELOCITY_WINDOW_MS = 90

const REST = { x: 0, y: 0, dragging: false, width: 1, height: 1 }

/**
 * Pointer handling for one draggable card. Written by hand with pointer events,
 * like the timeline's pan and zoom, rather than pulling in a gesture library
 * for a single card.
 *
 * Returns the live offset to draw the card at, and the handlers to spread on
 * it. The card needs `touch-action: none`, or a touch drag scrolls the page
 * instead of moving the card.
 *
 * `onSwipe(direction)` fires once on a release that commits; anything else
 * snaps back to rest.
 */
export function useSwipeGesture({ onSwipe, disabled = false }) {
  const [offset, setOffset] = useState(REST)
  const gesture = useRef(null)

  function reset() {
    gesture.current = null
    setOffset(REST)
  }

  const handlers = {
    onPointerDown(event) {
      if (disabled || gesture.current) return
      // Primary button only: a right-click drag is somebody reaching for a menu.
      if (event.pointerType === 'mouse' && event.button !== 0) return
      try {
        // Keeps the moves coming when a fast drag outruns the card.
        event.currentTarget.setPointerCapture?.(event.pointerId)
      } catch {
        // No such active pointer (a synthetic event); dragging still works.
      }
      const rect = event.currentTarget.getBoundingClientRect()
      gesture.current = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        width: rect.width,
        height: rect.height,
        samples: [{ x: event.clientX, y: event.clientY, t: event.timeStamp }],
      }
    },

    onPointerMove(event) {
      const current = gesture.current
      if (!current || event.pointerId !== current.id) return
      current.samples.push({ x: event.clientX, y: event.clientY, t: event.timeStamp })
      while (current.samples.length > 2 && event.timeStamp - current.samples[0].t > VELOCITY_WINDOW_MS) {
        current.samples.shift()
      }
      setOffset({
        x: event.clientX - current.startX,
        y: event.clientY - current.startY,
        dragging: true,
        width: current.width,
        height: current.height,
      })
    },

    onPointerUp(event) {
      const current = gesture.current
      if (!current || event.pointerId !== current.id) return
      const first = current.samples[0]
      const elapsed = Math.max(1, event.timeStamp - first.t)
      const direction = decideSwipe({
        dx: event.clientX - current.startX,
        dy: event.clientY - current.startY,
        vx: (event.clientX - first.x) / elapsed,
        vy: (event.clientY - first.y) / elapsed,
        width: current.width,
        height: current.height,
      })
      gesture.current = null
      if (direction) {
        // Hold the card where it was let go; the caller flies it out from there.
        setOffset((previous) => ({ ...previous, dragging: false }))
        onSwipe(direction)
      } else {
        setOffset(REST)
      }
    },

    onPointerCancel: reset,
    onLostPointerCapture(event) {
      if (gesture.current && event.pointerId === gesture.current.id) reset()
    },
  }

  return { offset, handlers, reset }
}
