import type { Processor } from 'unified'
import type {} from 'remark-parse'
import type { Construct, Extension } from 'micromark-util-types'
import type { Extension as FromMarkdownExtension } from 'mdast-util-from-markdown'

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    noctuaInlineMath: 'noctuaInlineMath'
    noctuaDisplayMath: 'noctuaDisplayMath'
    noctuaMathData: 'noctuaMathData'
  }
}

// Parse before Markdown consumes the backslash as a punctuation escape. Code spans,
// fences and existing dollar math keep their own parsers; source offsets stay exact.
const latexMath: Construct = {
  name: 'noctuaLatexMath',
  tokenize(effects, ok, nok) {
    let dataOpen = false
    let closing: number
    let token: 'noctuaInlineMath' | 'noctuaDisplayMath'
    return start
    function start(code: number | null) {
      if (code !== 92) return nok(code)
      // The outer token covers both delimiters and the untouched LaTeX body.
      effects.enter('noctuaInlineMath')
      effects.consume(code)
      return opening
    }
    function opening(code: number | null) {
      if (code !== 40 && code !== 91) return nok(code)
      closing = code === 40 ? 41 : 93
      token = code === 40 ? 'noctuaInlineMath' : 'noctuaDisplayMath'
      // Both syntaxes share one tokenizer; classify the complete token at closure.
      effects.consume(code)
      return body
    }
    function body(code: number | null) {
      if (code === null) return nok(code)
      if (code === -3 || code === -4 || code === -5) {
        if (dataOpen) effects.exit('noctuaMathData')
        dataOpen = false
        effects.enter('lineEnding')
        effects.consume(code)
        effects.exit('lineEnding')
        return body
      }
      if (!dataOpen) {
        effects.enter('noctuaMathData')
        dataOpen = true
      }
      effects.consume(code)
      return code === 92 ? afterSlash : body
    }
    function afterSlash(code: number | null) {
      if (code === closing) {
        effects.consume(code)
        effects.exit('noctuaMathData')
        const complete = effects.exit('noctuaInlineMath')
        complete.type = token
        return ok
      }
      // A doubled backslash is a LaTeX line break, not a closing delimiter.
      if (code === 92) {
        effects.consume(code)
        return body
      }
      return body(code)
    }
  }
}
const fromMarkdown: FromMarkdownExtension = {
  enter: {
    noctuaInlineMath(token) {
      this.enter(
        {
          type: 'inlineMath',
          value: '',
          data: { hName: 'code', hProperties: { className: ['language-math', 'math-inline'] } }
        },
        token
      )
      this.buffer()
    },
    noctuaDisplayMath(token) {
      this.enter(
        {
          type: 'inlineMath',
          value: '',
          data: { hName: 'code', hProperties: { className: ['language-math', 'math-display'] } }
        },
        token
      )
      this.buffer()
    }
  },
  exit: {
    noctuaInlineMath(token) {
      finish.call(this, token)
    },
    noctuaDisplayMath(token) {
      finish.call(this, token)
    }
  }
}
const finish: import('mdast-util-from-markdown').Handle = function (token) {
  this.resume()
  const node = this.stack[this.stack.length - 1]
  if (node.type !== 'inlineMath') return
  node.value = this.sliceSerialize(token).slice(2, -2).trim()
  node.data!.hChildren = [{ type: 'text', value: node.value }]
  this.exit(token)
}
export function remarkLatexMath(this: Processor) {
  const data = this.data()
  const extensions = data.micromarkExtensions || (data.micromarkExtensions = [])
  const fromExtensions = data.fromMarkdownExtensions || (data.fromMarkdownExtensions = [])
  extensions.push({ text: { 92: latexMath } } satisfies Extension)
  fromExtensions.push(fromMarkdown)
}
