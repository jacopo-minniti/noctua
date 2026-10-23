interface MathNode {
  type: string
  position?: { start: { offset?: number } }
  data?: { hProperties?: { className?: string[] } }
  children?: MathNode[]
}

// Preserve source offsets and raw text while displaying same-line $$ formulas as blocks.
export function remarkDisplayMath() {
  return (tree: MathNode, file: { value: unknown }) => {
    const source = String(file.value)
    const walk = (node: MathNode) => {
      const offset = node.position?.start.offset
      if (node.type === 'inlineMath' && offset !== undefined && source.startsWith('$$', offset)) {
        const properties = node.data?.hProperties
        if (properties) properties.className = ['language-math', 'math-display']
      }
      node.children?.forEach(walk)
    }
    walk(tree)
  }
}
