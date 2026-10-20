import type { Annotation } from '../../lib/editor'

const ids = new WeakMap<object, number>()
let next = 1

/** Identity key for an immutable object — changes whenever the edit is replaced. */
export function objKey(o: object): string {
  let k = ids.get(o)
  if (!k) {
    k = next++
    ids.set(o, k)
  }
  return String(k)
}

/** What a page preview was rendered from: annotation id → objKey, or 'hidden' for an edit being typed in. */
export interface PagePreview {
  url: string
  entries: Map<string, string>
}

/** Signature of what a page's preview must show; equal signatures need no re-render. */
export function previewEntries(anns: Annotation[], editingId: string | null): Map<string, string> {
  const m = new Map<string, string>()
  for (const a of anns) m.set(a.id, a.id === editingId && a.kind === 'text' ? 'hidden' : objKey(a))
  return m
}

export function entriesSignature(entries: Map<string, string>, patchStamp: number): string {
  return [...entries].map(([k, v]) => `${k}=${v}`).join('|') + `#${patchStamp}`
}
