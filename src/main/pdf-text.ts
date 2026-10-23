// Use the same patched official engine for extraction and the visible page reader.
let engine: Promise<typeof import('unpdf')> | undefined
export function pdfTextEngine(): Promise<typeof import('unpdf')> {
  engine ??= (async () => {
    const api = await import('unpdf')
    await api.definePDFJSModule(() => import('pdfjs-dist/legacy/build/pdf.mjs'))
    return api
  })()
  return engine
}
