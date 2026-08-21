import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

import { accentFor } from '../../lib/format'
import { boundsOf } from '../../lib/forceGraph'
import { isWatched } from '../../lib/watchStorage'

/**
 * The catalog as a graph you can push around.
 *
 * React renders the nodes and links exactly once and never touches their
 * geometry again: the simulation writes `transform` and the line endpoints
 * straight to the DOM inside a `requestAnimationFrame` loop. Re-rendering 262
 * elements through React sixty times a second would be a lot of machinery to
 * animate two numbers each, and because positions are never passed as props
 * there is nothing for a later render to overwrite.
 *
 * The loop only runs while the graph is actually moving — the simulation cools
 * to a stop and the frame is cancelled — so a settled graph costs nothing.
 *
 * Until you touch it, the view refits itself every frame. The graph spreads out
 * as it settles and the window can change size underneath it; refitting
 * continuously means it always fills the space on its own and there is never
 * anything to scroll to. The moment you pan, zoom or drag, that stops and the
 * view is yours.
 */

const MIN_ZOOM = 0.15
const MAX_ZOOM = 3
/** Pointer travel that still counts as a click rather than a drag. */
const CLICK_SLOP = 4

/**
 * Take or give back pointer capture, tolerating a refusal.
 *
 * Capture is what keeps a drag tracking once the pointer leaves the node, which
 * is a nicety rather than a requirement — and it throws for a pointer the
 * browser does not consider active. Letting that escape would abort the handler
 * before the drag had even been recorded, so a failure here loses the nicety
 * and nothing else.
 */
function capture(element, pointerId, take) {
  try {
    if (take) element.setPointerCapture?.(pointerId)
    else element.releasePointerCapture?.(pointerId)
  } catch {
    // No capture available for this pointer. The drag still works.
  }
}

/** Hubs are drawn bigger. Square-rooted, so one huge node cannot dominate. */
function radiusOf(node) {
  return 4.5 + Math.min(Math.sqrt(node.degree) * 2.4, 8.5)
}

function labelOf(title) {
  return title.length > 30 ? `${title.slice(0, 29)}…` : title
}

export function GraphCanvas({
  graph,
  simulation,
  progress,
  activeIds,
  selectedId,
  hovering,
  related,
  onSelect,
  onHover,
  onOpen,
  onStep,
  onToggleWatched,
  pinned,
  onPinned,
  command,
  showAllLabels,
  onZoom,
}) {
  const svgRef = useRef(null)
  const viewportRef = useRef(null)
  const nodeRefs = useRef(new Map())
  const linkRefs = useRef(new Map())

  const view = useRef({ x: 0, y: 0, k: 1 })
  const box = useRef({ width: 0, height: 0 })
  const frame = useRef(0)
  const drag = useRef(null)
  /** Set the first time the view is moved by hand. Stops the auto-fit. */
  const touched = useRef(false)

  // Every pointer currently down, keyed by id — the only way to notice a
  // second finger has landed, since each one is a separate pointerdown rather
  // than something a single `drag` gesture already tracks.
  const pointers = useRef(new Map())
  /** Set while two fingers are down: a pinch, anchored to the graph point
   *  under their midpoint so it stays under the fingers as they move. */
  const pinch = useRef(null)

  const { nodes, links } = graph

  // ------------------------------------------------------------- drawing --
  const paint = useCallback(() => {
    for (const node of nodes) {
      const element = nodeRefs.current.get(node.id)
      if (element) element.setAttribute('transform', `translate(${node.x} ${node.y})`)
    }
    for (const link of links) {
      const element = linkRefs.current.get(link.id)
      if (!element) continue
      const from = nodes[link.source]
      const to = nodes[link.target]
      element.setAttribute('x1', from.x)
      element.setAttribute('y1', from.y)
      element.setAttribute('x2', to.x)
      element.setAttribute('y2', to.y)
    }
  }, [nodes, links])

  const applyView = useCallback(() => {
    const { x, y, k } = view.current
    viewportRef.current?.setAttribute('transform', `translate(${x} ${y}) scale(${k})`)
  }, [])

  const centre = useCallback(
    (point, zoom) => {
      const { width, height } = box.current
      if (width < 1 || height < 1) return
      const k = zoom ?? view.current.k
      view.current = { k, x: width / 2 - point.x * k, y: height / 2 - point.y * k }
      applyView()
      onZoom?.(k)
    },
    [applyView, onZoom],
  )

  const fit = useCallback(() => {
    const { width, height } = box.current
    // A canvas with no area yet would divide its way to a zoom of nearly zero
    // and leave the graph a speck nobody could find their way back from.
    if (width < 1 || height < 1) return

    const bounds = boundsOf(nodes)
    const k = Math.min(
      Math.max(Math.min(width / bounds.width, height / bounds.height), MIN_ZOOM),
      MAX_ZOOM,
    )
    centre({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }, k)
  }, [nodes, centre])

  /** Run the simulation until it stops, then stand down. */
  const run = useCallback(() => {
    cancelAnimationFrame(frame.current)
    const step = () => {
      const alpha = simulation.tick()
      paint()
      if (!touched.current) fit()
      // Keep going while a drag is live even once it has cooled, so the node
      // under the pointer still tracks it.
      if (alpha > 0.0021 || drag.current?.node) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
  }, [simulation, paint, fit])

  // ------------------------------------------------------------ measuring --
  const measure = useCallback(() => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    box.current = { width: rect.width, height: rect.height }
    if (!touched.current) fit()
  }, [fit])

  // Measured directly first and only then observed: a `ResizeObserver` delivers
  // nothing until the next frame, and in an environment that never paints one
  // it delivers nothing at all — which would leave the graph unfitted with no
  // way to notice.
  useLayoutEffect(() => {
    paint()
    measure()

    const observer = new ResizeObserver(measure)
    if (svgRef.current) observer.observe(svgRef.current)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [paint, measure])

  useEffect(() => {
    run()
    return () => cancelAnimationFrame(frame.current)
  }, [run])

  // ---------------------------------------------------------- navigation --
  // Focus follows the selection, but only while the graph already has it:
  // otherwise clicking a toolbar button would steal focus back into the graph.
  useEffect(() => {
    const element = nodeRefs.current.get(selectedId)
    if (!element || !svgRef.current?.contains(document.activeElement)) return
    if (document.activeElement !== element) element.focus({ preventScroll: true })
  }, [selectedId])

  useEffect(() => {
    if (!command) return

    if (command.kind === 'fit') {
      touched.current = false
      fit()
      return
    }

    // The page has already let the simulation go and emptied the pin set; all
    // that is left here is the motion.
    if (command.kind === 'reset') {
      touched.current = false
      simulation.reheat(0.8)
      run()
      return
    }

    const node = nodes.find((candidate) => candidate.id === command.id)
    if (!node) return

    // Only if it is off screen. Recentring on something already in view makes
    // every arrow key throw the whole graph sideways under the reader.
    const { width, height } = box.current
    const { x, y, k } = view.current
    const at = { x: node.x * k + x, y: node.y * k + y }
    if (at.x > 60 && at.x < width - 60 && at.y > 60 && at.y < height - 60) return

    touched.current = true
    centre(node, Math.max(k, 0.9))
  }, [command, nodes, centre, fit, run, simulation])

  const zoomBy = useCallback(
    (factor, at) => {
      const previous = view.current.k
      const k = Math.min(Math.max(previous * factor, MIN_ZOOM), MAX_ZOOM)
      if (k === previous) return

      touched.current = true
      // Anchored on the pointer: the point under the cursor is the one that
      // stays put, which is the only zoom that feels like it is being aimed.
      view.current = {
        k,
        x: at.x - (at.x - view.current.x) * (k / previous),
        y: at.y - (at.y - view.current.y) * (k / previous),
      }
      applyView()
      onZoom?.(k)
    },
    [applyView, onZoom],
  )

  // Wired by hand rather than with `onWheel`, because React registers wheel
  // listeners as passive: `preventDefault` inside one is ignored, and the page
  // would scroll away underneath every zoom.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const onWheel = (event) => {
      event.preventDefault()
      const rect = svg.getBoundingClientRect()
      zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      })
    }

    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [zoomBy])

  function localPoint(event) {
    const rect = svgRef.current.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function graphPoint(event) {
    const local = localPoint(event)
    const { x, y, k } = view.current
    return { x: (local.x - x) / k, y: (local.y - y) / k }
  }

  function unpin(node) {
    if (!pinned.has(node.id)) return
    node.fx = null
    node.fy = null
    const next = new Set(pinned)
    next.delete(node.id)
    onPinned(next)
    simulation.reheat(0.4)
    run()
  }

  /** Start (or restart) a pinch from whichever two pointers are down. */
  function startPinch() {
    const [a, b] = pointers.current.values()
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1
    const { x, y, k } = view.current
    // The graph point under the midpoint, fixed for the life of the pinch —
    // holding it in place under the moving midpoint gives zoom and two-finger
    // pan in one gesture, the same way `zoomBy` anchors a wheel zoom.
    pinch.current = { distance, k, anchor: { x: (mid.x - x) / k, y: (mid.y - y) / k } }
  }

  // -------------------------------------------------------------- pointer --
  function onPointerDown(event, node = null) {
    if (event.button !== 0) return
    capture(event.currentTarget, event.pointerId, true)
    pointers.current.set(event.pointerId, localPoint(event))

    if (pointers.current.size >= 2) {
      // A second finger just landed. Whatever single-pointer gesture the
      // first one started — a pan, or a node picked up expecting a drag —
      // gives way to the pinch.
      if (drag.current?.node) {
        drag.current.node.fx = null
        drag.current.node.fy = null
      }
      drag.current = null
      startPinch()
      return
    }

    drag.current = { node, start: localPoint(event), moved: false, view: { ...view.current } }

    if (node) {
      node.fx = node.x
      node.fy = node.y
      simulation.reheat(0.45)
      run()
    }
  }

  function onPointerMove(event) {
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, localPoint(event))
    }

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = pointers.current.values()
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const k = Math.min(
        Math.max(pinch.current.k * (distance / pinch.current.distance), MIN_ZOOM),
        MAX_ZOOM,
      )
      touched.current = true
      view.current = {
        k,
        x: mid.x - pinch.current.anchor.x * k,
        y: mid.y - pinch.current.anchor.y * k,
      }
      applyView()
      onZoom?.(k)
      return
    }

    const state = drag.current
    if (!state) return

    const local = localPoint(event)
    if (!state.moved) {
      const travel = Math.hypot(local.x - state.start.x, local.y - state.start.y)
      if (travel < CLICK_SLOP) return
      state.moved = true
      touched.current = true
    }

    if (state.node) {
      const point = graphPoint(event)
      state.node.fx = point.x
      state.node.fy = point.y
      simulation.reheat(0.35)
      return
    }

    view.current = {
      ...view.current,
      x: state.view.x + (local.x - state.start.x),
      y: state.view.y + (local.y - state.start.y),
    }
    applyView()
  }

  function onPointerUp(event) {
    pointers.current.delete(event.pointerId)
    // Either finger lifting ends the pinch outright, rather than trying to
    // hand off to a one-finger pan mid-gesture.
    if (pointers.current.size < 2) pinch.current = null

    const state = drag.current
    drag.current = null
    if (!state) return
    capture(event.currentTarget, event.pointerId, false)

    if (!state.node) {
      // Never moved, so it was a click on empty space rather than a pan:
      // the same "let go" a click on nothing gives everywhere else.
      if (!state.moved) onSelect(null)
      return
    }

    if (state.moved) {
      // Left where it was dropped, and everything else redistributes around it.
      // That is the point of being able to move a title at all: you are
      // rearranging the graph to read it, not flicking it and watching it
      // spring back. Double-click hands it back to the simulation.
      onPinned(new Set(pinned).add(state.node.id))
      simulation.reheat(0.5)
      run()
      return
    }

    // Never moved, so it was a click rather than a drag: select it, and undo
    // the pin that `pointerdown` put on it in the expectation of one.
    state.node.fx = null
    state.node.fy = null
    onSelect(state.node.id)
  }

  /**
   * Handled on the canvas rather than on each node, so it does not matter which
   * element inside actually holds focus — and so there is one place to read
   * rather than 123 identical listeners.
   */
  function onKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return

    // Escape lets go of the selection, and of the focus that goes with it —
    // leaving focus on a node nothing is selecting would put the ring and the
    // highlight back the moment anything re-read it.
    if (event.key === 'Escape') {
      if (!selectedId) return
      onSelect(null)
      if (svgRef.current?.contains(document.activeElement)) document.activeElement.blur()
      event.preventDefault()
      return
    }

    if (!selectedId) return

    const middle = { x: box.current.width / 2, y: box.current.height / 2 }
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowLeft':
        onStep(selectedId, event.key === 'ArrowRight' ? 1 : -1)
        break
      case 'ArrowDown':
        onStep(selectedId, 'unlocks')
        break
      case 'ArrowUp':
        onStep(selectedId, 'needs')
        break
      case 'Enter':
        onOpen(selectedId)
        break
      case 'w':
      case 'W':
        onToggleWatched(selectedId)
        break
      case '+':
      case '=':
        zoomBy(1.25, middle)
        break
      case '-':
        zoomBy(0.8, middle)
        break
      default:
        return
    }
    event.preventDefault()
  }

  return (
    <svg
      ref={svgRef}
      className="size-full touch-none bg-base select-none"
      role="application"
      aria-label="Catalog dependency graph"
      onKeyDown={onKeyDown}
      onPointerDown={(event) => onPointerDown(event)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => {
        touched.current = false
        fit()
      }}
    >
      <defs>
        <marker
          id="graph-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0,1 L7,4 L0,7 Z" fill="var(--color-ink)" />
        </marker>
      </defs>

      <g ref={viewportRef}>
        <g fill="none">
          {links.map((link) => {
            const lit = activeIds.has(link.from) || activeIds.has(link.to)
            // Only a hover fades the rest of the graph. The selection is
            // long-lived — dimming for it would mean arriving on a page whose
            // graph is already mostly greyed out, which is not a graph.
            const dimmed = hovering && !lit
            const essential = link.strength === 'essential'
            return (
              <line
                key={link.id}
                ref={(element) => {
                  if (element) linkRefs.current.set(link.id, element)
                  else linkRefs.current.delete(link.id)
                }}
                stroke={lit ? 'var(--color-ink)' : 'var(--color-hairline-strong)'}
                strokeWidth={lit ? 1.6 : 1}
                // Dashed means recommended rather than required, the same
                // convention the per-title graph uses.
                strokeDasharray={essential ? undefined : '3 3'}
                markerEnd={lit ? 'url(#graph-arrow)' : undefined}
                opacity={lit ? 1 : dimmed ? 0.07 : essential ? 0.45 : 0.28}
                style={{ transition: 'opacity 120ms' }}
              />
            )
          })}
        </g>

        {nodes.map((node, index) => {
          const watched = isWatched(progress, node.id)
          const active = activeIds.has(node.id)
          const near = related.has(node.id)
          const dimmed = hovering && !active && !near
          const radius = radiusOf(node)

          return (
            <g
              key={node.id}
              ref={(element) => {
                if (element) nodeRefs.current.set(node.id, element)
                else nodeRefs.current.delete(node.id)
              }}
              // Roving: one Tab stop for the whole graph, then the arrow keys.
              // 123 sequential tab stops would be a worse way in than none.
              // With nothing selected the first title holds the stop, so
              // Escape can never leave the graph unreachable by keyboard.
              tabIndex={(selectedId ? node.id === selectedId : index === 0) ? 0 : -1}
              role="button"
              aria-label={watched ? `${node.title} (watched)` : node.title}
              aria-current={node.id === selectedId ? 'true' : undefined}
              className="cursor-grab focus:outline-none active:cursor-grabbing"
              opacity={dimmed ? 0.22 : 1}
              style={{ transition: 'opacity 120ms' }}
              onPointerDown={(event) => {
                // Stopped here so the background does not also start a pan.
                // `pointermove` deliberately is *not* stopped: pointer capture
                // retargets it to this node, and it still has to reach the
                // canvas handler, which is what actually runs the drag.
                event.stopPropagation()
                onPointerDown(event, node)
              }}
              onPointerUp={(event) => {
                event.stopPropagation()
                onPointerUp(event)
              }}
              onPointerEnter={() => onHover(node.id)}
              onPointerLeave={() => onHover(null)}
              onFocus={() => onSelect(node.id)}
              onDoubleClick={(event) => {
                event.stopPropagation()
                unpin(node)
              }}
            >
              {/* A generous invisible disc, so a 5px dot is still something a
                  pointer can reasonably be expected to hit. */}
              <circle r={radius + 8} fill="transparent" />
              {pinned.has(node.id) && (
                <circle
                  r={radius + 4}
                  fill="none"
                  stroke="var(--color-ink-dim)"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
              )}
              {active && (
                <circle
                  r={radius + 5}
                  fill="none"
                  stroke="var(--color-ink)"
                  strokeWidth={node.id === selectedId ? 1.5 : 1}
                  opacity={node.id === selectedId ? 0.9 : 0.5}
                />
              )}
              <circle
                r={radius}
                fill={watched ? 'var(--color-ok)' : accentFor(node)}
                stroke="var(--color-base)"
                strokeWidth="1.5"
                opacity={node.tier === 'adjacent' && !active ? 0.55 : 1}
              />
              <text
                y={radius + 11}
                textAnchor="middle"
                className="pointer-events-none font-mono"
                fontSize="9"
                fill={active || near ? 'var(--color-ink)' : 'var(--color-ink-dim)'}
                opacity={active || near ? 1 : showAllLabels ? 0.75 : 0}
                style={{ transition: 'opacity 120ms' }}
              >
                {labelOf(node.title)}
              </text>
            </g>
          )
        })}
      </g>
    </svg>
  )
}
