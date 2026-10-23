import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { Markdown } from '../src/renderer/src/Markdown'

const render = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }))
const inline = (html: string) => (html.match(/class="katex"/g) || []).length
const display = (html: string) => (html.match(/class="katex-display"/g) || []).length

describe('Markdown LaTeX output', () => {
  it('renders dollar and backslash delimiters together with the correct inline/display modes', () => {
    const text = String.raw`Inline $a_1$ and \(b_2\). Display $$c^2$$ and \[d^3\].`
    const html = render(text)
    expect(inline(html)).toBe(4)
    expect(display(html)).toBe(2)
    expect(html).not.toContain('katex-error')
  })
  it('preserves LaTeX commands and multiline matrices without treating them as Markdown', () => {
    const html = render(String.raw`\[
\begin{bmatrix}
1 & 2 \\
3 & 4
\end{bmatrix}
\]

An inline \(\frac{x_i}{y_j} + \alpha\) expression.`)
    expect(inline(html)).toBe(2)
    expect(display(html)).toBe(1)
    expect(html).not.toContain('katex-error')
    expect(html).toContain('bmatrix')
  })
  it('keeps code examples, escaped delimiters and incomplete streamed formulas literal', () => {
    const html = render(
      String.raw`Code: \`\(x\)\` and \`\[y\]\`.

\`\`\`latex
\(a\)
\[b\]
\`\`\`

Escaped: \\(c\\) and \\[d\\]. Incomplete: \(e + f`.replace(/\\`/g, '`')
    )
    expect(inline(html)).toBe(0)
    expect(html).toContain('\\(x\\)')
    expect(html).toContain('Incomplete: (e + f')
    expect(inline(render(String.raw`\(e + f\)`))).toBe(1)
  })
  it('handles each incomplete streaming prefix and CRLF math without crashing', () => {
    const formula = String.raw`\[\begin{matrix}1 & 2 \\ 3 & 4\end{matrix}\]`
    for (let end = 1; end < formula.length; end++)
      expect(() => render(formula.slice(0, end))).not.toThrow()
    expect(display(render(formula))).toBe(1)
    expect(display(render('\\[\r\nx^2\r\n\\]'))).toBe(1)
    const quoted = render('> \\[\n> x_i + y_j\n> \\]')
    expect(display(quoted)).toBe(1)
    expect(quoted).not.toContain('katex-error')
  })
  it('retains source line anchors through quoted/list formulas and renders old messages without rewriting text', () => {
    const text = String.raw`# Heading

> A formula \(x_1\).

- Result: \[\sum_i x_i\]

## After

A final paragraph.`
    const html = render(text)
    expect(inline(html)).toBe(2)
    expect(html).toContain('data-source-line="7"')
    expect(html).toContain('data-source-line="9"')
    expect(text).toContain(String.raw`\(x_1\)`)
  })
})
