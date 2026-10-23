// Operate on Markdown text nodes only: fenced code, inline code and math remain literal.
interface Node {
  type: string
  value?: string
  children?: Node[]
  url?: string
  alt?: string
}
export function remarkWikiLinks() {
  return (tree: Node) => {
    const walk = (node: Node) => {
      if (!node.children) return
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text' || !child.value) {
          walk(child)
          return [child]
        }
        const result: Node[] = []
        const pattern = /(!?)\[\[([^\]\n]+)\]\]/g
        let start = 0
        for (const match of child.value.matchAll(pattern)) {
          if (match.index! > start)
            result.push({ type: 'text', value: child.value.slice(start, match.index) })
          const [target, alias] = match[2].split('|')
          result.push(
            match[1]
              ? { type: 'image', url: target, alt: alias || target }
              : {
                  type: 'link',
                  url: `noctua-note:${encodeURIComponent(target)}`,
                  children: [{ type: 'text', value: alias || target }]
                }
          )
          start = match.index! + match[0].length
        }
        if (!result.length) return [child]
        if (start < child.value.length)
          result.push({ type: 'text', value: child.value.slice(start) })
        return result
      })
    }
    walk(tree)
  }
}
