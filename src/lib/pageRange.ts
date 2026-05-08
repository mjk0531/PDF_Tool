/**
 * Parse a page range string like "1-3, 5, 7-9" into an ordered list of unique page numbers.
 * Returns null if the input is invalid.
 */
export function parsePageRange(input: string, totalPages: number): number[] | null {
  const trimmed = input.trim()
  if (!trimmed) return Array.from({ length: totalPages }, (_, i) => i + 1)

  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean)
  const pages = new Set<number>()

  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      const n = parseInt(part, 10)
      if (n < 1 || n > totalPages) return null
      pages.add(n)
    } else if (/^\d+\s*-\s*\d+$/.test(part)) {
      const [a, b] = part.split('-').map((s) => parseInt(s.trim(), 10))
      if (a < 1 || b < 1 || a > totalPages || b > totalPages) return null
      const [lo, hi] = a <= b ? [a, b] : [b, a]
      for (let i = lo; i <= hi; i++) pages.add(i)
    } else {
      return null
    }
  }

  return Array.from(pages).sort((a, b) => a - b)
}
