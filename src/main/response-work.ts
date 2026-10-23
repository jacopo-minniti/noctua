/** Display a bounded projection of study-tool activity, not raw provider payloads. */
const hidden =
  /^(solution|hints?|back|apiKey|authorization|credentials?|.*token|thinkingSignature|signature)$/i
export function activityDetails(value: unknown): string {
  const clean = (item: unknown, depth = 0): unknown => {
    if (depth > 8) return '[Omitted]'
    if (typeof item === 'string') {
      try {
        return clean(JSON.parse(item), depth + 1)
      } catch {
        return item.slice(0, 12000)
      }
    }
    if (Array.isArray(item)) return item.slice(0, 30).map((part) => clean(part, depth + 1))
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item)
          .slice(0, 60)
          .map(([key, part]) => [key, hidden.test(key) ? '[Hidden]' : clean(part, depth + 1)])
      )
    return item
  }
  return (JSON.stringify(clean(value), null, 2) || '').slice(0, 16000)
}
