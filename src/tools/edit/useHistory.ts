import { useCallback, useRef, useState } from 'react'

interface HistoryState<T> {
  past: T[]
  present: T
  future: T[]
}

const LIMIT = 200
const COALESCE_MS = 1200

/**
 * Undo/redo for a single value. Consecutive changes sharing a `coalesce` key
 * within a short window (typing into one text box, nudging one box) collapse
 * into one undo step.
 */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState<HistoryState<T>>({ past: [], present: initial, future: [] })
  const last = useRef<{ key: string; at: number } | null>(null)

  const set = useCallback((updater: T | ((prev: T) => T), coalesce?: string) => {
    setState((s) => {
      const next = typeof updater === 'function' ? (updater as (p: T) => T)(s.present) : updater
      if (next === s.present) return s
      const now = Date.now()
      const merge = !!coalesce && last.current?.key === coalesce && now - last.current.at < COALESCE_MS
      last.current = coalesce ? { key: coalesce, at: now } : null
      if (merge) return { past: s.past, present: next, future: [] }
      return { past: [...s.past, s.present].slice(-LIMIT), present: next, future: [] }
    })
  }, [])

  /** Replace the present without recording a step (derived data, async fills). */
  const replace = useCallback((updater: (prev: T) => T) => {
    setState((s) => ({ ...s, present: updater(s.present) }))
  }, [])

  const undo = useCallback(() => {
    last.current = null
    setState((s) =>
      s.past.length
        ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] }
        : s,
    )
  }, [])

  const redo = useCallback(() => {
    last.current = null
    setState((s) =>
      s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s,
    )
  }, [])

  const reset = useCallback((value: T) => {
    last.current = null
    setState({ past: [], present: value, future: [] })
  }, [])

  return {
    value: state.present,
    set,
    replace,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}
