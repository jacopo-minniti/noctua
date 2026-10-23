import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, realpath, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { _electron } from 'playwright'
import { build as bundleFixture } from 'esbuild'

// A native desktop integration test. All sources and model responses are synthetic.
// It exercises the real Pi provider stream and tool execution, not a replacement harness.
const directory = await mkdtemp(path.join(os.tmpdir(), 'noctua-desktop-'))
const vault = path.join(directory, 'vault'),
  data = path.join(directory, 'profile'),
  artifacts = path.join(directory, 'screenshots')
await Promise.all([vault, data, artifacts].map((folder) => mkdir(folder, { recursive: true })))
const noteMarkdown =
  '# Linear algebra\n\nAn eigenvector of a matrix A is a nonzero vector v for which $Av = \\lambda v$.\n\n' +
  Array.from(
    { length: 35 },
    (_, i) =>
      `Background paragraph ${i}: A synthetic explanation of linear transformations and eigenvectors.\n\n`
  ).join('') +
  '## Geometric meaning\n\n**Direction** is preserved on a line.\n\n$$Av = \\lambda v$$\n\n| Quantity | Meaning |\n| --- | --- |\n| v | Eigenvector |\n\n[[Mechanics|Momentum]]\n\n![Synthetic diagram](diagram.png)\n'
await writeFile(path.join(vault, 'Linear algebra.md'), noteMarkdown)
await writeFile(
  path.join(vault, 'diagram.png'),
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=',
    'base64'
  )
)
await writeFile(
  path.join(vault, 'Mechanics.md'),
  '# Mechanics\n\nMomentum is mass times velocity. Conservation of momentum requires an isolated system.\n'
)

function pdfFixture() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  for (const text of [
    'Newtonian mechanics: a synthetic study resource.',
    'Momentum equals mass times velocity. This is page two.'
  ]) {
    const stream = `BT /F1 16 Tf 60 720 Td (${text}) Tj ET`
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`)
  }
  let pdf = '%PDF-1.4\n',
    offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return pdf
}
const textbook = path.join(directory, 'mechanics.pdf')
await writeFile(textbook, pdfFixture())
let discoveredModels = ['noctua-synthetic-test', 'noctua-synthetic-namer']
const requests = []
const latexReply =
  String.raw`Inline $x_1$ and \(y_2\). Display $$z^2$$ and \[
\frac{a_i}{b_j}
\].` + '\n\n`\\(literal\\)`'
async function dropAttachment(page, file) {
  await page.evaluate(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.id = 'smoke-drop-file'
    input.hidden = true
    document.body.append(input)
  })
  await page.locator('#smoke-drop-file').setInputFiles(file)
  await page.evaluate(() => {
    const input = document.querySelector('#smoke-drop-file')
    const transfer = new DataTransfer()
    transfer.items.add(input.files[0])
    const target = document.querySelector('.markdown-composer .cm-content')
    target.dispatchEvent(
      new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer })
    )
    target.dispatchEvent(
      new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer })
    )
    input.remove()
  })
}
const messageText = (message) =>
  typeof message?.content === 'string'
    ? message.content
    : (message?.content || [])
        .filter((item) => item.type === 'text')
        .map((item) => item.text)
        .join('\n')
const server = createServer(async (req, res) => {
  if (req.url === '/api/version') {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ version: 'synthetic' }))
    return
  }
  if (req.url === '/v1/models') {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ data: discoveredModels.map((id) => ({ id, object: 'model' })) }))
    return
  }
  let body = ''
  for await (const chunk of req) body += chunk
  try {
    const input = JSON.parse(body)
    if (req.url === '/api/show') {
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify(
          input.model === 'qwen3.8-synthetic'
            ? {
                capabilities: ['completion', 'thinking'],
                thinking: { values: [false, 'low', 'medium', 'xhigh'], default: 'medium' }
              }
            : { capabilities: ['completion'], thinking: { values: [false], default: false } }
        )
      )
      return
    }
    if (req.url === '/api/embed') {
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          embeddings: input.input.map((text) =>
            /eigen|linear|matrix/i.test(text)
              ? [1, 0, 0.1]
              : /momentum|mechanics|velocity/i.test(text)
                ? [0, 1, 0.1]
                : [0.1, 0.1, 1]
          )
        })
      )
      return
    }
    if (req.url !== '/v1/chat/completions') {
      res.writeHead(404)
      res.end()
      return
    }
    requests.push(input)
    const lastUser = input.messages.findLastIndex((message) => message.role === 'user')
    const lastTool = input.messages.findLastIndex((message) => message.role === 'tool')
    const text = messageText(input.messages[lastUser])
    const grounding = text.match(/<source_passages>([\s\S]*?)<\/source_passages>/)
    const passages = grounding ? JSON.parse(grounding[1]) : []
    const source = passages.find((source) => source.path === 'Linear algebra.md') || passages[0]
    const refs = source ? [source.id] : []
    let tool,
      args,
      response = ''
    if (input.model === 'noctua-synthetic-namer' && text.startsWith('{"firstQuestion":')) {
      assert.equal(input.tools?.length || 0, 0)
      assert((input.max_tokens ?? input.max_completion_tokens) <= 128)
      await new Promise((resolve) => setTimeout(resolve, 900))
      response = 'Eigenvector study'
    } else if (text.includes('<study_completion>'))
      response = 'Your saved attempt is recorded. Let’s continue with the original study goal.'
    else if (/synthetic note create/i.test(text) && lastTool < lastUser) {
      tool = 'create_note'
      args = {
        path: 'Model notes/Practice context.md',
        content: '# Practice context\n\nA model-authored explanation for the learner to inspect.',
        rationale: 'Save the requested resource note.'
      }
    } else if (/synthetic note edit/i.test(text)) {
      const results = input.messages
        .slice(lastUser + 1)
        .filter((message) => message.role === 'tool')
      if (!results.length) {
        tool = 'read_note'
        args = { path: 'Model notes/Practice context.md' }
      } else if (results.length === 1) {
        const read = JSON.parse(messageText(results[0]))
        tool = 'edit_note'
        args = {
          path: read.path,
          expectedRevision: read.revision,
          operation: 'append',
          after: 'An additional scoped explanation.',
          rationale: 'Refine the requested note.'
        }
      } else response = 'The requested note update is saved.'
    } else if (lastTool > lastUser) response = 'Your activities are ready in the study desk.'
    else if (/synthetic desk exercise ([a-f0-9-]+)/i.test(text)) {
      tool = 'focus_study'
      args = {
        kind: 'exercise',
        itemIds: [text.match(/synthetic desk exercise ([a-f0-9-]+)/i)[1]],
        reason: 'Try the request budget here, then we can discuss your result.'
      }
    } else if (input.tools?.some((tool) => tool.function.name === 'record_feedback')) {
      tool = 'record_feedback'
      args = {
        outcome: 'correct',
        feedback:
          'Your reasoning identifies the preserved direction and justifies the scalar relation. Check the nonzero-vector assumption.'
      }
    } else if (/exercises/i.test(text)) {
      tool = 'create_exercises'
      args = {
        exercises: [
          {
            title: 'Explain the geometric meaning',
            prompt:
              'Explain why an eigenvector keeps its direction under a linear transformation. What changes when its eigenvalue is negative?',
            kind: 'comprehension',
            hints: [
              'Compare $Av$ with a scalar multiple of $v$.',
              'Distinguish a line from an oriented direction.'
            ],
            solution:
              'The relation $Av = \\lambda v$ means the image lies on the same line. A negative eigenvalue reverses the oriented direction. The zero vector is excluded.',
            criteria: [
              'State the scalar-multiple relationship',
              'Explain reversal for a negative eigenvalue'
            ],
            conceptId: source?.conceptId || undefined,
            sourceIds: refs
          }
        ]
      }
    } else if (/latex delimiter regression/i.test(text)) response = latexReply
    else if (/flashcards/i.test(text)) {
      tool = 'create_flashcards'
      args = {
        cards: [
          {
            front: 'What defines an eigenvector of a matrix $A$?',
            back: 'A nonzero vector $v$ satisfying $Av = \\lambda v$ for a scalar $\\lambda$.',
            conceptId: source?.conceptId,
            sourceIds: refs
          },
          {
            front: 'What does a negative eigenvalue do to an eigenvector’s direction?',
            back: 'It reverses the oriented direction, while preserving the line it spans.',
            conceptId: source?.conceptId,
            sourceIds: refs
          },
          {
            front: 'Why is the zero vector excluded from eigenvectors?',
            back: 'It satisfies the relation for every scalar and does not specify a direction.',
            conceptId: source?.conceptId,
            sourceIds: refs
          }
        ]
      }
    } else if (/layout regression/i.test(text))
      response = Array.from(
        { length: 60 },
        (_, index) =>
          `Paragraph ${index + 1}: A synthetic explanation long enough to exercise transcript scrolling while keeping the workspace controls in view.\n\n`
      ).join('')
    else
      response = `An eigenvector remains on the same line under the transformation. ${source ? `[Linear algebra](noctua-source:${source.id})` : ''}`
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })
    const chunk = (delta, finishReason = null) =>
      res.write(
        `data: ${JSON.stringify({ id: 'synthetic-completion', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: 'noctua-synthetic-test', choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`
      )
    chunk({ role: 'assistant' })
    chunk({
      reasoning_content: 'I will check the supplied study context before choosing an action.'
    })
    if (tool) {
      chunk({
        tool_calls: [
          {
            index: 0,
            id: `call-${requests.length}`,
            type: 'function',
            function: { name: tool, arguments: JSON.stringify(args) }
          }
        ]
      })
      chunk({}, 'tool_calls')
    } else {
      if (/layout regression/i.test(text)) {
        for (const paragraph of response.split('\n\n')) {
          if (res.destroyed) break
          chunk({ content: `${paragraph}\n\n` })
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      } else chunk({ content: response })
      chunk({}, 'stop')
    }
    res.end('data: [DONE]\n\n')
  } catch (error) {
    res.writeHead(500)
    res.end(String(error))
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const database = new DatabaseSync(path.join(data, 'noctua.sqlite'))
database.exec('CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
database.prepare('INSERT INTO metadata VALUES(?,?)').run(
  'settings',
  JSON.stringify({
    vaultPath: null,
    modelKey: 'noctua-local/noctua-synthetic-test',
    usePiCredentials: false,
    localBaseUrl: `http://127.0.0.1:${port}/v1`,
    localModelIds: [],
    embeddings: {
      enabled: true,
      baseUrl: `http://127.0.0.1:${port}`,
      model: 'synthetic-embedding'
    },
    apiProvider: 'anthropic'
  })
)
database.close()
let electron
const launch = async () => {
  const env = { ...process.env, NOCTUA_DATA_DIR: data, PI_OFFLINE: '1' }
  delete env.ELECTRON_RUN_AS_NODE
  const executablePath = process.env.NOCTUA_TEST_EXECUTABLE
  electron = await _electron.launch({
    executablePath,
    args: executablePath ? [] : [path.resolve('.')],
    timeout: 25000,
    env
  })
  electron.process().stderr.on('data', (bytes) => {
    const line = bytes.toString()
    if (/Error|failed/i.test(line)) console.error(line.trim())
  })
  await electron.evaluate(
    ({ dialog, shell }, paths) => {
      dialog.showOpenDialog = async (_window, options) => ({
        canceled: false,
        filePaths: options.properties.includes('openDirectory') ? [paths.vault] : [paths.textbook]
      })
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: paths.exportFile })
      shell.openPath = async () => ''
      globalThis.__noctuaOpenedUrls = []
      shell.openExternal = async (url) => {
        globalThis.__noctuaOpenedUrls.push(url)
      }
    },
    { vault, textbook, exportFile: path.join(directory, 'backup.json') }
  )
  const page = await electron.firstWindow({ timeout: 15000 })
  page.setDefaultTimeout(15000)
  page.on('pageerror', (error) => console.error('Renderer error:', error.message))
  await page.locator('.app').waitFor()
  return page
}
const snapshot = (page) => page.evaluate(() => window.noctua.request({ action: 'snapshot' }))
const waitForApp = async (page, predicate, arg) => {
  const deadline = Date.now() + 15000
  do {
    if (await page.evaluate(predicate, arg)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  } while (Date.now() < deadline)
  throw new Error('Timed out waiting for persisted application state.')
}
const settleLayout = (page) =>
  page.waitForFunction(() =>
    ['.app', '.sidebar', '.study-desk'].every(
      (selector) =>
        !document
          .querySelector(selector)
          .getAnimations()
          .some((animation) => animation.playState === 'running')
    )
  )
const openStudy = async (page, label) => {
  const existing = page.getByRole('tab', { name: label, exact: true })
  if (await existing.count()) await existing.click()
  else {
    await page.getByRole('button', { name: 'New study tab', exact: true }).click()
    await page
      .locator('.study-surface[data-pane="right"] .study-choices')
      .getByRole('button', { name: label, exact: true })
      .click()
  }
}
const newChatTab = async (page) => {
  await page.getByRole('button', { name: 'New tab', exact: true }).click()
  await page
    .locator('.study-surface[data-pane="main"] .study-choices')
    .getByRole('button', { name: 'Chat', exact: true })
    .click()
}
const assertWorkspaceFits = async (page) => {
  await settleLayout(page)
  const geometry = await page.evaluate(() => {
    const selectors = [
      '.sidebar',
      '.chat-area',
      '.chat-scroll',
      '.composer-zone',
      '.send-button',
      '.study-desk',
      '.desk-tabs'
    ]
    return {
      width: innerWidth,
      height: innerHeight,
      pageScroll: document.scrollingElement.scrollTop,
      pageOverflow: document.scrollingElement.scrollWidth - innerWidth,
      regions: selectors.flatMap((selector) => {
        const element = document.querySelector(selector)
        if (!element || element.closest('[data-collapsed="true"]')) return []
        const rect = element.getBoundingClientRect()
        return [
          {
            selector,
            x: rect.x,
            y: rect.y,
            right: rect.right,
            bottom: rect.bottom,
            height: rect.height
          }
        ]
      }),
      ancestorScroll: ['.app', '.chat-area', '.study-desk'].map(
        (selector) => document.querySelector(selector)?.scrollTop || 0
      )
    }
  })
  assert.equal(geometry.pageScroll, 0)
  assert(geometry.pageOverflow <= 1, JSON.stringify(geometry))
  assert(
    geometry.ancestorScroll.every((offset) => offset === 0),
    JSON.stringify(geometry)
  )
  for (const region of geometry.regions) {
    assert(region.height > 0, JSON.stringify(region))
    assert(region.x >= -1 && region.y >= -1, JSON.stringify(region))
    assert(region.right <= geometry.width + 1, JSON.stringify(region))
    assert(region.bottom <= geometry.height + 1, JSON.stringify(region))
  }
}
const resizeWindow = async (width, height, zoom = 1) => {
  await electron.evaluate(
    ({ BrowserWindow }, size) => {
      const window = BrowserWindow.getAllWindows()[0]
      window.setContentSize(size.width, size.height)
      window.webContents.setZoomFactor(size.zoom)
    },
    { width, height, zoom }
  )
  const page = await electron.firstWindow()
  await page.waitForFunction(
    (size) =>
      Math.abs(innerWidth - size.width / size.zoom) <= 1 &&
      Math.abs(innerHeight - size.height / size.zoom) <= 1,
    { width, height, zoom }
  )
}
try {
  let page = await launch()
  await page.locator('.model-button').filter({ hasText: 'noctua-synthetic-test' }).waitFor()
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  await page.screenshot({ path: path.join(artifacts, '01-welcome.png') })
  console.log('PASS: native launch, isolated preload, and model discovery')
  await page.keyboard.press('Meta+,')
  await page.getByRole('button', { name: 'Sign in with ChatGPT', exact: true }).click()
  await page.getByLabel('Sign-in redirect link').waitFor()
  await page.getByRole('button', { name: 'Cancel sign-in', exact: true }).click()
  await page
    .getByRole('button', { name: 'Sign in with ChatGPT', exact: true })
    .waitFor({ state: 'visible' })
  await page.getByRole('button', { name: 'Sign in with ChatGPT', exact: true }).click()
  await page.getByLabel('Sign-in redirect link').waitFor()
  assert(
    (await electron.evaluate(() => globalThis.__noctuaOpenedUrls)).some((url) =>
      url.startsWith('https://auth.openai.com/')
    )
  )
  const authState = await snapshot(page)
  assert.equal(authState.providerLogin.status, 'waiting')
  assert(!JSON.stringify(authState).includes('access_token'))
  await page.screenshot({ path: path.join(artifacts, '11-chatgpt-sign-in.png') })
  await page.getByRole('button', { name: 'Cancel sign-in', exact: true }).click()
  await page.getByRole('button', { name: 'Sign in with ChatGPT', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Models', exact: true }).click()
  assert.equal(
    await page.getByRole('button', { name: 'Sign in with ChatGPT', exact: true }).count(),
    0
  )
  await page
    .getByLabel('Main chat', { exact: true })
    .selectOption('noctua-local/noctua-synthetic-namer')
  await page
    .getByLabel('Chat naming', { exact: true })
    .selectOption('noctua-local/noctua-synthetic-namer')
  await page.getByRole('button', { name: 'Save settings', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Model defaults saved.' }).waitFor()
  assert.equal((await snapshot(page)).settings.modelKey, 'noctua-local/noctua-synthetic-namer')
  await page
    .getByLabel('Main chat', { exact: true })
    .selectOption('noctua-local/noctua-synthetic-test')
  await page.getByRole('button', { name: 'Save settings', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Model defaults saved.' }).waitFor()
  assert.equal(
    (await snapshot(page)).settings.roleModels.chatTitle,
    'noctua-local/noctua-synthetic-namer'
  )
  await page.screenshot({ path: path.join(artifacts, '25-model-defaults.png') })
  await page.getByRole('button', { name: 'Providers', exact: true }).click()
  await page.getByRole('button', { name: 'Sign in with ChatGPT', exact: true }).waitFor()
  assert.equal(await page.getByLabel('Chat naming', { exact: true }).count(), 0)
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('Synthetic learner')
  await page.getByLabel('About you', { exact: true }).fill('I am studying linear algebra.')
  await page
    .getByLabel('Custom instructions', { exact: true })
    .fill('Use short questions to check my reasoning.')
  await page.getByLabel('Profile photo', { exact: true }).setInputFiles(path.resolve('logo.png'))
  await page.getByAltText('Profile preview').waitFor()
  await page.getByRole('button', { name: 'Save settings', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Profile saved.' }).waitFor()
  assert.equal((await snapshot(page)).settings.profile.name, 'Synthetic learner')
  await page.screenshot({ path: path.join(artifacts, '20-profile-settings.png') })
  assert.equal(await page.locator('.conversation-row').count(), 0)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  const deskTabsY = await page
    .locator('.desk-tabs')
    .evaluate((element) => element.getBoundingClientRect().top)
  assert(deskTabsY < 35, `Study buttons too low: ${deskTabsY}`)
  assert.equal(await page.locator('.desk-tabs [role="tab"]').count(), 1)
  assert.equal(await page.getByRole('tab', { name: 'New tab', exact: true }).count(), 1)
  await page
    .locator('.study-surface[data-pane="right"] .study-choices')
    .getByRole('button', { name: 'Sources', exact: true })
    .click()
  console.log(
    'PASS: profile settings/photo saved, empty conversations hidden and study buttons raised'
  )
  console.log(
    'PASS: in-app ChatGPT sign-in via real Pi OAuth, intercepted browser launch, cancellation/retry, and callback cleanup'
  )
  for (const [width, height, zoom] of [
    [1080, 720, 1],
    [900, 600, 1],
    [900, 600, 1.25]
  ]) {
    await resizeWindow(width, height, zoom)
    await page.waitForFunction(() => document.querySelector('.app').clientWidth === innerWidth)
    await assertWorkspaceFits(page)
  }
  await resizeWindow(900, 600)
  await page.screenshot({ path: path.join(artifacts, '05-compact-workspace.png') })
  await resizeWindow(1480, 940)
  console.log('PASS: workspace stays within smaller windows and increased zoom')
  await page.getByRole('button', { name: 'Connect an Obsidian vault or Markdown folder' }).click()
  await page.getByText('Semantic retrieval ready', { exact: true }).waitFor()
  assert.equal(await page.locator('.chat-header').count(), 0)
  assert.equal(await page.getByLabel('Reasoning effort').isDisabled(), true)
  const emptyHeight = await page
    .locator('.markdown-composer')
    .evaluate((element) => element.getBoundingClientRect().height)
  assert(emptyHeight <= 40)
  assert.equal(
    await page.locator('.composer-zone').evaluate((element) => getComputedStyle(element).maxWidth),
    '760px'
  )
  await page.getByLabel('Message Noctua').fill('@Linear')
  await page.getByRole('option', { name: /Linear algebra Linear algebra/ }).click()
  await page.locator('.selected-sources > span').first().waitFor()
  assert.equal(await page.locator('.selected-sources > span').count(), 1)
  assert((await page.locator('.selected-sources').textContent()).includes('Linear algebra'))
  await page.getByLabel('Message Noctua').pressSequentially('First line')
  await page.getByLabel('Message Noctua').press('Shift+Enter')
  await page.getByLabel('Message Noctua').pressSequentially('Second line')
  assert(
    (await page
      .locator('.markdown-composer')
      .evaluate((element) => element.getBoundingClientRect().height)) > emptyHeight
  )
  await page.getByLabel('Message Noctua').fill('')
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  console.log(
    'PASS: header removed, compact growing composer, capability-aware reasoning selector, and searchable vault chips'
  )
  discoveredModels.push('new-synthetic-model')
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await waitForApp(page, async () =>
    (await window.noctua.request({ action: 'snapshot' })).models.some(
      (model) => model.id === 'new-synthetic-model'
    )
  )
  await page.locator('.model-button').hover()
  await page.locator('.model-families button').filter({ hasText: 'Local' }).waitFor()
  assert.equal(await page.locator('.model-popover input').count(), 0)
  assert.equal(await page.locator('.model-flyout').count(), 0)
  await page.locator('.model-families button').filter({ hasText: 'GPT' }).waitFor()
  const compactBounds = await page.locator('.model-popover').boundingBox()
  assert.ok(compactBounds.width < 180, 'family popup reserves no model column')
  await page.locator('.model-families button').filter({ hasText: 'Local' }).hover()
  await page.locator('.model-list button').filter({ hasText: 'noctua-synthetic-test' }).waitFor()
  const familyBounds = await page.locator('.model-families').boundingBox()
  const modelBounds = await page.locator('.model-list').boundingBox()
  assert.ok(
    modelBounds.x >= familyBounds.x + familyBounds.width,
    'models appear to the right of families'
  )
  await page.locator('.model-list button').filter({ hasText: 'new-synthetic-model' }).waitFor()
  const chipBounds = await page.locator('.model-families button.active').boundingBox()
  const flyoutBounds = await page.locator('.model-flyout').boundingBox()
  assert.ok(flyoutBounds.width <= 225, 'model flyout is compact')
  assert.ok(
    Math.abs(chipBounds.y + chipBounds.height / 2 - flyoutBounds.y - flyoutBounds.height / 2) < 3,
    'flyout centers beside the hovered family'
  )
  await page.screenshot({ path: path.join(artifacts, '14-model-family-flyout.png') })
  await page.locator('.model-list button').filter({ hasText: 'noctua-synthetic-test' }).hover()
  await page.locator('.model-flyout').waitFor()
  await page.keyboard.press('Escape')
  console.log(
    'PASS: focused app rescans local provider and the picker includes newly available models'
  )
  let state = await snapshot(page)
  assert.equal(state.index.documents, 2)
  assert.equal(state.index.mode, 'semantic')
  assert.equal(state.index.vectors, state.index.chunks)
  await page
    .locator('.document-row')
    .filter({ hasText: 'Linear algebra' })
    .locator('button')
    .first()
    .click()
  await page.locator('.source-reader-document .katex-display').waitFor()
  assert.equal(await page.locator('.source-reader-document table').count(), 1)
  await page.locator('.source-reader-document img').scrollIntoViewIfNeeded()
  await page.waitForFunction(() => {
    const image = document.querySelector('.source-reader-document img')
    return image?.complete && image.naturalWidth > 0
  })
  await page.getByRole('button', { name: 'Momentum', exact: true }).click()
  await page.locator('.reader-heading h3').filter({ hasText: 'Mechanics' }).waitFor()
  await page.getByRole('button', { name: 'Back to study desk' }).click()
  await page.getByLabel('Search sources').fill('Geometric meaning')
  await page.getByLabel('Search sources').press('Enter')
  await page
    .locator('.source-result-heading')
    .filter({ hasText: 'Geometric meaning' })
    .first()
    .click()
  await page.locator('.reader-location').filter({ hasText: 'Current revision' }).waitFor()
  await page.waitForFunction(() => {
    const reader = document.querySelector('.source-reader-document')
    const heading = [...reader.querySelectorAll('h2')].find(
      (heading) => heading.textContent === 'Geometric meaning'
    )
    return (
      heading &&
      reader.scrollTop > 0 &&
      heading.getBoundingClientRect().top >= reader.getBoundingClientRect().top - 1 &&
      heading.getBoundingClientRect().bottom <= reader.getBoundingClientRect().bottom
    )
  })
  await page.getByRole('button', { name: 'Open source in Obsidian', exact: true }).click()
  const openedUrls = await electron.evaluate(() => globalThis.__noctuaOpenedUrls)
  assert(
    openedUrls.some((value) =>
      new URL(value).searchParams.get('path')?.endsWith('Linear algebra.md#Geometric meaning')
    )
  )
  await assertWorkspaceFits(page)
  await page.screenshot({ path: path.join(artifacts, '09-source-reader.png') })
  await page.getByRole('button', { name: 'Back to study desk' }).click()
  await page.getByLabel('Search sources').fill('')
  console.log(
    'PASS: full Markdown source reader, math, tables, vault images/wiki links, heading focus, and Obsidian URI handoff'
  )
  await dropAttachment(page, textbook)
  await page.locator('.document-row').filter({ hasText: 'PDF · available for retrieval' }).waitFor()
  await page.locator('.selected-sources .attachment-preview canvas:not([hidden])').waitFor()
  await page.locator('.selected-sources .attachment-preview').click()
  await page.locator('.pdf-page-surface .textLayer span').first().waitFor()
  assert.equal(await page.getByRole('button', { name: 'Cited passage', exact: true }).count(), 0)
  const beforePinch = await page
    .locator('[data-page-number="1"]')
    .evaluate((element) => element.getBoundingClientRect().width)
  const beforeBar = await page
    .locator('.pdf-controls')
    .evaluate((element) => element.getBoundingClientRect().left)
  await page
    .locator('.pdf-reader')
    .dispatchEvent('wheel', { ctrlKey: true, deltaY: -50, bubbles: true, cancelable: true })
  await page.waitForFunction(
    (width) =>
      document.querySelector('[data-page-number="1"]').getBoundingClientRect().width > width * 1.5,
    beforePinch
  )
  assert(
    await page
      .locator('[data-page-number="1"] .pdf-page-surface')
      .evaluate(
        (surface) =>
          surface.dataset.ready === 'true' &&
          getComputedStyle(surface).visibility === 'visible' &&
          surface.querySelector('canvas').width > 0
      ),
    'the rendered page stays visible while pinch zoom updates'
  )
  await page.locator('.pdf-page-scroll').evaluate((element) => {
    element.scrollLeft = 80
  })
  assert.equal(
    await page.locator('.pdf-controls').evaluate((element) => element.getBoundingClientRect().left),
    beforeBar
  )
  await page
    .locator('.pdf-reader')
    .dispatchEvent('wheel', { ctrlKey: true, deltaY: 50, bubbles: true, cancelable: true })
  await page.waitForFunction(
    (width) =>
      Math.abs(
        document.querySelector('[data-page-number="1"]').getBoundingClientRect().width - width
      ) < 1,
    beforePinch
  )

  await page.getByRole('button', { name: 'Back to study desk' }).click()
  const conversationId = (await snapshot(page)).conversations[0].id
  const passages = await page.evaluate(
    (id) =>
      window.noctua.request({ action: 'search', query: 'momentum page two', conversationId: id }),
    conversationId
  )
  assert(
    passages.some(
      (source) =>
        source.kind === 'pdf' &&
        source.title === 'mechanics' &&
        source.page === 2 &&
        /Momentum/.test(source.text)
    )
  )
  const pdfDocument = await page.evaluate(
    (source) => window.noctua.request({ action: 'sourceDocument', source }),
    passages.find((source) => source.kind === 'pdf' && source.page === 2)
  )
  assert.equal(pdfDocument.document.pages.length, 2)
  assert(pdfDocument.document.pages[1].includes('Momentum'))
  console.log('PASS: vault vectors, hybrid retrieval, and page-aware PDF attachment')
  await page.getByLabel('Message Noctua').fill('/flash')
  await page.getByRole('option', { name: /Flashcards/ }).click()
  await page.locator('.composer-tool-chip').filter({ hasText: '/flashcards' }).waitFor()
  await page
    .locator('.markdown-composer .cm-content')
    .fill('Create three flashcards about eigenvectors using my notes.')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await page.locator('.library-card').first().waitFor()
  state = await snapshot(page)
  assert.equal(await page.locator('.selected-sources .attachment-preview').count(), 0)
  await page.locator('.message.user .attachment-preview canvas:not([hidden])').first().waitFor()
  await page.locator('.message.user .attachment-preview').first().click()
  await page.locator('.pdf-page-surface .textLayer span').first().waitFor()
  await page.getByRole('button', { name: 'Back to study desk' }).click()
  assert.equal(state.cards.length, 3)
  assert(state.cards.every((card) => card.sources.length > 0))
  assert(state.conversations[0].sessionFile)
  // The foreground answer/tools can finish while the separate naming request runs.
  await waitForApp(
    page,
    async (id) => {
      const current = await window.noctua.request({ action: 'snapshot' })
      return (
        current.conversations.find((chat) => chat.id === id)?.titleGeneration?.status === 'complete'
      )
    },
    conversationId
  )
  const renamed = (await snapshot(page)).conversations.find((chat) => chat.id === conversationId)
  assert.equal(renamed.title, 'Eigenvector study')
  assert.equal(renamed.titleOrigin, 'model')
  assert.equal(renamed.titleGeneration.modelKey, 'noctua-local/noctua-synthetic-namer')
  assert(requests.some((request) => request.model === 'noctua-synthetic-namer'))
  if (await page.getByRole('button', { name: 'All flashcards', exact: true }).count())
    await page.getByRole('button', { name: 'All flashcards', exact: true }).click()
  await page.getByRole('button', { name: 'Start recall', exact: true }).click()
  await page.getByRole('button', { name: 'Reveal answer' }).click()
  const trace = page.locator('.message.assistant .response-work').last()
  await trace.waitFor()
  assert.equal(await trace.locator('details[open]').count(), 0)
  await trace
    .locator('.work-item')
    .filter({ hasText: 'Preparing flashcards' })
    .locator('summary')
    .click()
  assert.equal(await trace.locator('details[open]').count(), 1)
  assert((await trace.textContent()).includes('[Hidden]'))
  await trace
    .locator('.work-item')
    .filter({ hasText: 'Thinking' })
    .first()
    .locator('summary')
    .click()
  await page.screenshot({ path: path.join(artifacts, '21-response-activity.png') })
  await trace
    .locator('details[open] summary')
    .evaluateAll((elements) => elements.forEach((element) => element.click()))
  await page.screenshot({ path: path.join(artifacts, '02-flashcards.png') })
  await page.keyboard.press('3')
  await waitForApp(page, async () =>
    (await window.noctua.request({ action: 'snapshot' })).cards.some(
      (card) => card.scheduler.reps === 1
    )
  )
  console.log('PASS: real Pi tool creation, source references, answer reveal, and FSRS review')
  await page.getByLabel('Message Noctua').fill('/ex')
  await page.getByLabel('Message Noctua').press('Enter')
  await page.locator('.composer-tool-chip').filter({ hasText: '/exercises' }).waitFor()
  await page
    .locator('.markdown-composer .cm-content')
    .fill('Create an exercise about the geometric meaning of eigenvectors.')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await page.getByLabel('Your exercise answer').waitFor()
  await page.getByRole('button', { name: 'A small hint' }).click()
  await page.getByText('HINT 1', { exact: true }).waitFor()
  await page
    .getByLabel('Your exercise answer')
    .fill(
      'The image is a scalar multiple of a nonzero vector. It remains on the same line. A negative scalar reverses its oriented direction.'
    )
  await page.getByRole('button', { name: 'Check reasoning', exact: true }).click()
  await page
    .getByText('Your reasoning identifies the preserved direction', { exact: false })
    .waitFor()
  state = await snapshot(page)
  assert.equal(state.exercises.length, 1)
  assert.equal(state.attempts.length, 1)
  assert.equal(state.attempts[0].outcome, 'correct')
  assert.equal(state.attempts[0].assistance, 1)
  assert.equal(state.attempts[0].solutionSeen, false)
  assert.equal(
    state.concepts.find((concept) => concept.id === state.exercises[0].conceptId)
      .independentSuccesses,
    0
  )
  assert.equal(await page.locator('.solution').count(), 0)
  await page.screenshot({ path: path.join(artifacts, '03-exercises.png') })
  console.log('PASS: exercise grading and persistent help separate from independent evidence')
  await electron.close()
  electron = null
  page = await launch()
  assert.equal(
    await page
      .getByTitle('Hide study desk')
      .evaluate((element) => getComputedStyle(element).getPropertyValue('-webkit-app-region')),
    'no-drag'
  )
  const studyTabs = await page
    .locator('.desk-tabs .chat-tab')
    .evaluateAll((tabs) => tabs.map((tab) => ({ bottom: tab.getBoundingClientRect().bottom })))
  const surfaceTop = await page
    .locator('.study-surface:not([hidden])')
    .first()
    .evaluate((el) => el.getBoundingClientRect().top)
  assert(
    studyTabs.every((tab) => tab.bottom <= surfaceTop),
    'study tabs sit above the activity surface'
  )
  const navToggleBounds = await page.getByTitle('Hide navigation').boundingBox()
  const chatTabBounds = await page.getByRole('tab').first().boundingBox()
  assert(
    Math.abs(
      navToggleBounds.y + navToggleBounds.height / 2 - chatTabBounds.y - chatTabBounds.height / 2
    ) < 1,
    'navigation toggle aligns vertically with the conversation tabs'
  )
  state = await snapshot(page)
  assert.equal(state.cards.length, 3)
  assert.equal(state.attempts.length, 1)
  assert.equal(state.exerciseProgress[state.exercises[0].id].hintsShown, 1)
  assert.equal(state.cards.filter((card) => card.scheduler.reps === 1).length, 1)
  const messages = await page.evaluate(
    (id) => window.noctua.request({ action: 'messages', conversationId: id }),
    conversationId
  )
  assert.equal(messages.filter((message) => message.role === 'user').length, 2)
  assert.equal(await page.locator('.desk-tabs button').filter({ hasText: 'Concepts' }).count(), 0)
  await page.getByRole('button', { name: 'Concept map', exact: true }).click()
  await page.getByTitle('Concept list', { exact: true }).click()
  await page.getByRole('dialog', { name: 'All concepts' }).waitFor()
  assert.equal(await page.locator('.concept-list-item[open]').count(), 0)
  await page.screenshot({ path: path.join(artifacts, '22-concept-list.png') })
  await page.locator('.concept-list-item > summary').filter({ hasText: 'Linear algebra' }).click()
  await page
    .getByRole('dialog', { name: 'All concepts' })
    .getByLabel('Level for Linear algebra', { exact: true })
    .selectOption('knowledge')
  await page
    .locator('.concept-card')
    .filter({ hasText: 'Linear algebra' })
    .getByRole('button', { name: 'Preview tag in note' })
    .click()
  await page.getByRole('button', { name: 'Save tag to vault', exact: true }).click()
  await page.locator('.tag-preview').waitFor({ state: 'hidden' })
  assert((await readFile(path.join(vault, 'Linear algebra.md'), 'utf8')).includes('#knowledge'))
  await page.evaluate(() => window.noctua.request({ action: 'export' }))
  const backup = JSON.parse(await readFile(path.join(directory, 'backup.json'), 'utf8'))
  assert.equal(backup.records.review.length, 1)
  assert.equal(backup.records.attempt.length, 1)
  assert.equal(backup.includesCredentials, false)
  await page.screenshot({ path: path.join(artifacts, '04-concepts.png') })
  await page.getByLabel('Close concept list', { exact: true }).click()
  await page.getByRole('tab', { name: 'Eigenvector study', exact: true }).click()
  const permitted = new Set([
    'search_vault',
    'read_source',
    'get_learning_state',
    'create_flashcards',
    'create_exercises',
    'record_feedback',
    'find_practice',
    'remember_study',
    'save_concept',
    'connect_concepts',
    'save_study_goal',
    'save_study_guide',
    'capture_bit',
    'propose_note_change',
    'focus_study',
    'web_search',
    'read_note',
    'create_note',
    'edit_note'
  ])
  assert.equal((await snapshot(page)).settings.profile.name, 'Synthetic learner')
  await page.locator('.message.user img[alt="Your profile"]').first().waitFor()
  const userBubble = await page
    .locator('.message.user')
    .last()
    .evaluate((message) => {
      const body = message.querySelector('.message-content')
      const avatar = message.querySelector('.message-avatar')
      const bubble = body.getBoundingClientRect()
      const photo = avatar.getBoundingClientRect()
      const row = message.getBoundingClientRect()
      return {
        photoAfterText: photo.left > bubble.right,
        alignedRight: Math.abs(photo.right - row.right) < 1,
        fits: bubble.left >= row.left && bubble.right <= row.right,
        background: getComputedStyle(body).backgroundColor,
        radius: parseFloat(getComputedStyle(body).borderTopLeftRadius)
      }
    })
  assert(userBubble.photoAfterText && userBubble.alignedRight && userBubble.fits)
  assert.equal(userBubble.background, 'rgb(239, 243, 233)')
  assert(userBubble.radius >= 16)
  await page.screenshot({ path: path.join(artifacts, '24-user-message-bubble.png') })
  assert(
    requests.some((request) =>
      request.messages.some(
        (message) =>
          message.role === 'system' &&
          JSON.stringify(message.content).includes('Use short questions to check my reasoning.')
      )
    )
  )
  assert(!JSON.stringify(requests).includes('data:image/png;base64,'))
  assert(requests.length >= 6)
  assert(
    requests.every((request) =>
      (request.tools || []).every((tool) => permitted.has(tool.function.name))
    )
  )
  console.log('PASS: restart continuity, reviewed vault tag, study backup, and bounded Pi tools')
  await resizeWindow(900, 600)
  assert.equal(await page.locator('.activity-select').count(), 0)
  await page
    .locator('.markdown-composer .cm-content')
    .fill('Layout regression: stream a long explanation.')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await page.waitForFunction(() => {
    const transcript = document.querySelector('.chat-scroll')
    return transcript.scrollHeight - transcript.clientHeight > 500
  })
  await assertWorkspaceFits(page)
  assert(
    await page
      .locator('.chat-scroll')
      .evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight < 48)
  )
  await page.locator('.chat-scroll').evaluate((element) => {
    element.scrollTop = 0
  })
  await page.waitForFunction(() => document.querySelector('.chat-scroll').scrollTop === 0)
  await page.locator('.send-button.stop').waitFor({ state: 'hidden' })
  assert.equal(await page.locator('.chat-scroll').evaluate((element) => element.scrollTop), 0)
  await assertWorkspaceFits(page)
  await page
    .locator('.markdown-composer .cm-content')
    .fill('Layout regression: stream another explanation.')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await page.locator('.send-button.stop').waitFor()
  await page.locator('.send-button.stop').waitFor({ state: 'hidden' })
  await page.waitForFunction(() => {
    const transcript = document.querySelector('.chat-scroll')
    return transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 48
  })
  await assertWorkspaceFits(page)
  await page.screenshot({ path: path.join(artifacts, '06-long-response.png') })
  for (const [width, height] of [
    [1080, 720],
    [1480, 940]
  ]) {
    await resizeWindow(width, height)
    await assertWorkspaceFits(page)
  }
  assert.equal(await page.locator('.chat-header [title="Hide study desk"]').count(), 0)
  assert.equal(await page.locator('.study-desk [title="Hide study desk"]').count(), 1)
  assert.equal(await page.locator('.sidebar [title="Hide navigation"]').count(), 1)
  await page.locator('.study-desk').getByTitle('Hide study desk').click()
  assert.notEqual(
    await page.locator('.app').evaluate((element) => getComputedStyle(element).transitionDuration),
    '0s'
  )
  await assertWorkspaceFits(page)
  await page.getByTitle('Show study desk').click()
  await assertWorkspaceFits(page)
  console.log(
    'PASS: long streams scroll only the transcript, respect reading earlier text, and follow new questions'
  )
  const panelWidth = async (selector) => {
    await settleLayout(page)
    return page.locator(selector).evaluate((element) => element.getBoundingClientRect().width)
  }
  const dragEdge = async (label, distance) => {
    const edge = page.getByRole('separator', { name: label })
    const box = await edge.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + distance, box.y + box.height / 2, { steps: 8 })
    await page.mouse.up()
  }
  const leftBefore = await panelWidth('.sidebar')
  const rightBefore = await panelWidth('.study-desk')
  await dragEdge('Resize navigation', 70)
  await dragEdge('Resize study desk', -90)
  const leftResized = await panelWidth('.sidebar')
  const rightResized = await panelWidth('.study-desk')
  assert(Math.abs(leftResized - leftBefore - 70) < 2)
  assert(Math.abs(rightResized - rightBefore - 90) < 2)
  await assertWorkspaceFits(page)
  await dragEdge('Resize study desk', -1000)
  const expandedDesk = await panelWidth('.study-desk')
  assert(expandedDesk > 600, `Study desk stopped at ${expandedDesk}px`)
  assert.equal(Math.round(await panelWidth('.chat-area')), 300)
  const tabBounds = await page.locator('.desk-tabs').boundingBox()
  assert(tabBounds.width > 600, 'tab strip follows the expanded pane')
  await page.screenshot({ path: path.join(artifacts, '23-expanded-study-tabs.png') })
  await assertWorkspaceFits(page)
  await resizeWindow(900, 600)
  await assertWorkspaceFits(page)
  await resizeWindow(1480, 940)
  assert(Math.abs((await panelWidth('.study-desk')) - expandedDesk) < 2)
  await dragEdge('Resize study desk', expandedDesk - rightResized)
  assert(Math.abs((await panelWidth('.study-desk')) - rightResized) < 2)
  await page.getByRole('separator', { name: 'Resize navigation' }).focus()
  await page.keyboard.press('ArrowLeft')
  assert(Math.abs((await panelWidth('.sidebar')) - leftResized + 16) < 2)
  await resizeWindow(900, 600, 1.25)
  await assertWorkspaceFits(page)
  await resizeWindow(1480, 940)
  await openStudy(page, 'Practice')
  await page
    .getByLabel('Your exercise answer')
    .fill('Keep this draft while the study desk is closed.')
  const practiceSurface = page.locator('[data-study-kind="exercises"]')
  await page.getByLabel('Your exercise answer').evaluate((el) => {
    el.dataset.moveIdentity = 'original'
  })
  await page
    .getByRole('tab', { name: 'Practice', exact: true })
    .dragTo(page.locator('.chat-area > .chat-tabs'))
  await page.waitForFunction(
    () => document.querySelector('[data-study-kind="exercises"]').dataset.pane === 'main'
  )
  assert.equal(
    await page.getByLabel('Your exercise answer').inputValue(),
    'Keep this draft while the study desk is closed.'
  )
  assert.equal(
    await page.getByLabel('Your exercise answer').getAttribute('data-move-identity'),
    'original'
  )
  await page.screenshot({ path: path.join(artifacts, '25-practice-main-tab.png') })
  await page.getByRole('button', { name: 'Move Practice to study desk', exact: true }).focus()
  await page.keyboard.press('Enter')
  assert.equal(await practiceSurface.getAttribute('data-pane'), 'right')
  assert.equal(
    await page.getByLabel('Your exercise answer').getAttribute('data-move-identity'),
    'original'
  )
  await page.getByRole('button', { name: 'New tab', exact: true }).click()
  await page
    .locator('.study-surface[data-pane="main"] .study-choices')
    .getByRole('button', { name: 'Cards', exact: true })
    .click()
  assert.equal(await page.locator('[data-study-kind="cards"]').getAttribute('data-pane'), 'main')
  assert(await practiceSurface.isVisible())
  assert(await page.locator('[data-study-kind="cards"]').isVisible())
  await page.screenshot({ path: path.join(artifacts, '26-two-study-panes.png') })
  await page.getByRole('button', { name: 'Close Cards study tab', exact: true }).click()
  console.log(
    'PASS: native tab drag to main, keyboard move back, preserved practice DOM/draft and independent activities in both panes'
  )
  await page.locator('.study-desk').getByTitle('Hide study desk').click()
  await page.locator('.sidebar').getByTitle('Hide navigation').click()
  await assertWorkspaceFits(page)
  assert.equal(await page.getByRole('separator').count(), 0)
  await page.reload()
  await page.getByTitle('Show navigation').waitFor()
  assert.equal(Math.round(await panelWidth('.sidebar')), 64)
  assert.equal(
    await page.locator('.sidebar').getByRole('button', { name: 'Settings', exact: true }).count(),
    1
  )
  assert.equal(
    await page
      .locator('.sidebar')
      .getByRole('button', { name: /Flashcards|Exercises|Concepts/ })
      .count(),
    0
  )
  await page.locator('.sidebar').getByRole('button', { name: 'Settings', exact: true }).click()
  await page.locator('.modal').waitFor()
  await page.keyboard.press('Escape')
  const originalChatTitle = (await snapshot(page)).conversations.find(
    (chat) => chat.id === conversationId
  ).title
  await page
    .locator('.sidebar')
    .getByRole('button', { name: 'New conversation', exact: true })
    .click()
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.sidebar .conversation-row').length === 1 &&
      !!document.querySelector('.welcome')
  )
  await page
    .locator('.sidebar')
    .getByRole('button', { name: originalChatTitle, exact: true })
    .click()
  await page.waitForFunction(() => document.querySelectorAll('.messages article').length > 0)
  await page.screenshot({ path: path.join(artifacts, '08-navigation-rail.png') })
  const navigationButton = await page.getByTitle('Show navigation').boundingBox()
  const deskButton = await page.getByTitle('Show study desk').boundingBox()
  assert(navigationButton.x < deskButton.x)
  assert.equal(await page.locator('.header-actions [title="Show navigation"]').count(), 0)
  await page.getByTitle('Show study desk').waitFor()
  assert.equal(
    await page
      .getByTitle('Show study desk')
      .evaluate((element) => getComputedStyle(element).getPropertyValue('-webkit-app-region')),
    'no-drag'
  )
  await assertWorkspaceFits(page)
  await page.getByTitle('Show navigation').click()
  await page.getByTitle('Show study desk').click()
  assert(Math.abs((await panelWidth('.sidebar')) - leftResized + 16) < 2)
  assert(Math.abs((await panelWidth('.study-desk')) - rightResized) < 2)
  await openStudy(page, 'Practice')
  assert.equal(
    await page.getByLabel('Your exercise answer').inputValue(),
    'Keep this draft while the study desk is closed.'
  )
  await page.locator('.study-desk').getByTitle('Hide study desk').click()
  await page.getByTitle('Show study desk').click()
  assert.equal(
    await page.getByLabel('Your exercise answer').inputValue(),
    'Keep this draft while the study desk is closed.'
  )
  await assertWorkspaceFits(page)
  await dragEdge('Resize navigation', -1000)
  await dragEdge('Resize study desk', 1000)
  assert.equal(Math.round(await panelWidth('.sidebar')), 160)
  assert.equal(Math.round(await panelWidth('.study-desk')), 240)
  assert(
    await page
      .locator('.sidebar')
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
  )
  await assertWorkspaceFits(page)
  await openStudy(page, 'Cards')
  if (await page.getByRole('button', { name: 'All flashcards', exact: true }).count())
    await page.getByRole('button', { name: 'All flashcards', exact: true }).click()
  await page.getByRole('button', { name: 'Start recall', exact: true }).click()
  await page.getByRole('button', { name: 'Reveal answer' }).click()
  const reviewsBeforeHide = (await snapshot(page)).cards.reduce(
    (total, card) => total + card.scheduler.reps,
    0
  )
  await page.locator('.study-desk').getByTitle('Hide study desk').click()
  await page.keyboard.press('3')
  assert.equal(
    (await snapshot(page)).cards.reduce((total, card) => total + card.scheduler.reps, 0),
    reviewsBeforeHide
  )
  await page.getByTitle('Show study desk').click()
  await page.getByRole('button', { name: 'Good', exact: false }).waitFor()
  await assertWorkspaceFits(page)
  await page.screenshot({ path: path.join(artifacts, '07-resizable-sidebars.png') })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.equal(
    await page.locator('.app').evaluate((element) => getComputedStyle(element).transitionDuration),
    '0s'
  )
  await page.locator('.study-desk').getByTitle('Hide study desk').click()
  await assertWorkspaceFits(page)
  await page.getByTitle('Show study desk').click()
  await assertWorkspaceFits(page)
  console.log(
    'PASS: mouse and keyboard resizing, independent collapse, remembered layout, and preserved practice drafts'
  )

  await page.locator('.study-surface:not([hidden]) .artifact-sources button').first().click()
  await page.locator('.source-warning').filter({ hasText: 'original has changed' }).waitFor()
  assert(
    await page
      .getByRole('button', { name: 'Cited passage', exact: true })
      .evaluate((element) => element.classList.contains('active'))
  )
  await page.getByRole('button', { name: 'Full source', exact: true }).click()
  await page.locator('.reader-location').filter({ hasText: 'Current revision' }).waitFor()
  await page.getByRole('button', { name: 'Back to study desk' }).click()
  const formattedDraft =
    '    preserved indentation\n\n## My question\n\n**Bold** and $x^2$\n\n$$y = \\alpha x$$\n\n```ts\nconst answer = 42\n```\n'
  const previousClipboard = await electron.evaluate(({ clipboard }) => clipboard.readText())
  await electron.evaluate(({ clipboard }, text) => clipboard.writeText(text), formattedDraft)
  await page.getByLabel('Message Noctua').click()
  await page.getByLabel('Message Noctua').press('Meta+v')
  await electron.evaluate(({ clipboard }, text) => clipboard.writeText(text), previousClipboard)
  await page.locator('.markdown-composer .katex-display').waitFor()
  assert.equal(await page.locator('.markdown-composer .composer-bold').textContent(), 'Bold')
  assert(
    (await page.locator('.markdown-composer .composer-code-line').allTextContents())
      .join('\n')
      .includes('preserved indentation')
  )
  assert.equal(await page.locator('.composer-preview').count(), 0)
  // Click rendered math to edit its source, then leave it to render again.
  await page
    .locator('.markdown-composer .composer-rendered')
    .filter({ has: page.locator('.katex-display') })
    .click()
  assert((await page.getByLabel('Message Noctua').textContent()).includes('$$y = \\alpha x$$'))
  await page.getByLabel('Message Noctua').press('Meta+End')
  await page.locator('.markdown-composer .katex-display').waitFor()
  // Completing syntax replaces it directly in the editor.
  await page.getByLabel('Message Noctua').press('Meta+a')
  await page.getByLabel('Message Noctua').press('Backspace')
  await page.getByLabel('Message Noctua').pressSequentially('**Instant**')
  await page.locator('.composer-bold').filter({ hasText: 'Instant' }).waitFor()
  assert.equal(await page.getByLabel('Message Noctua').textContent(), 'Instant')
  await page.waitForTimeout(600) // Separate undo groups, as with a pause while typing.
  await page.getByLabel('Message Noctua').pressSequentially(' more')
  await page.getByLabel('Message Noctua').press('Meta+z')
  assert.equal(await page.getByLabel('Message Noctua').textContent(), 'Instant')
  await page.getByLabel('Message Noctua').fill(formattedDraft)
  await resizeWindow(900, 600)
  await assertWorkspaceFits(page)
  await page.screenshot({ path: path.join(artifacts, '10-inline-composer.png') })
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await page.locator('.send-button.stop').waitFor({ state: 'hidden' })
  await waitForApp(
    page,
    async (text) => {
      const currentId = localStorage.getItem('noctua-current-chat')
      const messages = await window.noctua.request({
        action: 'messages',
        conversationId: currentId
      })
      return messages.some((message) => message.role === 'user' && message.text === text)
    },
    formattedDraft
  )
  console.log(
    'PASS: historical citation view, in-place math/Markdown editing, compact layout, and verbatim saved input'
  )
  const firstTabId = await page.evaluate(() => localStorage.getItem('noctua-current-chat'))
  await page.getByLabel('Message Noctua').fill('First tab draft')
  await newChatTab(page)
  await page.waitForFunction((id) => localStorage.getItem('noctua-current-chat') !== id, firstTabId)
  const secondTabId = await page.evaluate(() => localStorage.getItem('noctua-current-chat'))
  assert.equal(
    await page.getByLabel('Message Noctua').evaluate((element) => {
      const copy = element.cloneNode(true)
      copy.querySelectorAll('.cm-placeholder').forEach((node) => node.remove())
      return copy.textContent
    }),
    ''
  )
  // Empty tabs disappear on close, including their renderer-only workspace state.
  await page.getByLabel('Message Noctua').fill('   ')
  await page.getByRole('button', { name: 'Close tab 2', exact: true }).click()
  await page.waitForFunction((id) => localStorage.getItem('noctua-current-chat') === id, firstTabId)
  assert(!(await snapshot(page)).conversations.some((chat) => chat.id === secondTabId))
  assert.equal(await page.getByLabel('Reopen closed tab').count(), 0)
  await page.waitForFunction(
    (id) => !JSON.parse(localStorage.getItem('noctua-tab-workspaces') || '{}')[id],
    secondTabId
  )
  await newChatTab(page)
  await page.waitForFunction((id) => localStorage.getItem('noctua-current-chat') !== id, firstTabId)
  const usedSecondTabId = await page.evaluate(() => localStorage.getItem('noctua-current-chat'))
  await page.getByRole('tab').nth(1).dblclick()
  await page.getByLabel('Tab name').fill('Questions about the passage')
  await page.getByLabel('Tab name').press('Enter')
  await page.getByRole('tab', { name: 'Questions about the passage', exact: true }).waitFor()
  await page.getByLabel('Message Noctua').fill('Second tab draft')
  await page.getByRole('tab').first().click()
  assert.equal(await page.getByLabel('Message Noctua').textContent(), 'First tab draft')
  // Markdown and PDF selection use the same explicit destination action.
  let selectionScreenshot = false
  const selectPassage = async (locator) => {
    await locator.scrollIntoViewIfNeeded()
    await locator.evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    })
    const toolbar = page.getByRole('toolbar', { name: 'Add selection to chat' })
    await toolbar.waitFor()
    const toolbarBox = await toolbar.boundingBox()
    const selectionRect = await page.evaluate(() => {
      const rect = window.getSelection().getRangeAt(0).getClientRects()[0]
      return { top: rect.top, left: rect.left }
    })
    if (selectionRect.top > 80) assert(toolbarBox.y + toolbarBox.height <= selectionRect.top + 1)
    assert.equal(await page.locator('.excerpt-targets').count(), 0)
    if (!selectionScreenshot) {
      await page.screenshot({ path: path.join(artifacts, '13-selection-toolbar.png') })
      selectionScreenshot = true
    }
    await page.getByRole('button', { name: 'Add to Chat 2', exact: true }).click()
    await toolbar.waitFor({ state: 'hidden' })
  }
  await page.locator('.study-surface:not([hidden]) .artifact-sources button').first().click()
  await page.getByRole('button', { name: 'Full source', exact: true }).click()
  await selectPassage(page.locator('.source-reader-document .markdown p').first())
  await page.getByRole('button', { name: 'Back to study desk' }).click()
  await selectPassage(
    page
      .locator('.review-card .flip-card-face[aria-hidden=false] .selectable-passage')
      .first()
      .locator('.markdown')
  )
  await openStudy(page, 'Sources')
  await page
    .locator('.document-row')
    .filter({ hasText: 'mechanics' })
    .locator('button')
    .first()
    .click()
  await page.locator('.pdf-page-surface .textLayer span').first().waitFor()
  await selectPassage(page.locator('.pdf-page-surface .textLayer').first())
  await page.getByRole('tab').nth(1).click()
  assert.equal(await page.getByLabel('Message Noctua').textContent(), 'Second tab draft')
  assert.equal(await page.locator('.reference-chips .reference-chip').count(), 3)
  assert.equal(await page.locator('.source-reader').count(), 0)
  await electron.close()
  page = await launch()
  await page.locator('.reference-chips .reference-chip').nth(2).waitFor()
  assert.equal(await page.getByLabel('Message Noctua').textContent(), 'Second tab draft')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await page.locator('.send-button.stop').waitFor({ state: 'hidden' })
  await waitForApp(
    page,
    async (id) => {
      const messages = await window.noctua.request({ action: 'messages', conversationId: id })
      return messages.some(
        (message) =>
          message.role === 'user' &&
          message.references?.length === 3 &&
          message.references.every((reference) => reference.context?.text)
      )
    },
    usedSecondTabId
  )
  await page.locator('.message.user .message-references .reference-chip').first().waitFor()
  const sharedHeader = await page
    .locator('.message.user .learner-heading')
    .last()
    .evaluate((heading) => {
      const tag = heading.querySelector('.reference-chip').getBoundingClientRect()
      const meta = heading.querySelector('.message-meta').getBoundingClientRect()
      return { tagTop: tag.top, metaTop: meta.top }
    })
  assert(Math.abs(sharedHeader.tagTop - sharedHeader.metaTop) < 1)
  assert.equal(await page.locator('.message-sources').count(), 0)
  await page.screenshot({ path: path.join(artifacts, '26-tagged-message-header.png') })
  const isolated = await page.evaluate(
    async ({ first, second }) => ({
      first: await window.noctua.request({ action: 'messages', conversationId: first }),
      second: await window.noctua.request({ action: 'messages', conversationId: second })
    }),
    { first: firstTabId, second: usedSecondTabId }
  )
  assert(!isolated.first.some((message) => message.text === 'Second tab draft'))
  assert(
    isolated.second.some((message) => message.references?.some((reference) => reference.page === 1))
  )
  assert(
    requests.some((request) =>
      request.messages.some((message) => messageText(message).includes('<selected_excerpts>'))
    )
  )
  await page.getByRole('button', { name: 'Close tab 2', exact: true }).click()
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.chat-area > .chat-tabs .chat-tab:not(.study-tab) [role=tab]')
        .length === 1
  )
  assert.equal(
    await page.locator('.chat-area > .chat-tabs .chat-tab:not(.study-tab) [role=tab]').count(),
    1
  )
  await page.getByLabel('Reopen closed tab').selectOption(usedSecondTabId)
  await page.getByRole('tab').nth(1).waitFor()
  await page.screenshot({ path: path.join(artifacts, '12-chat-tabs.png') })
  await page.getByRole('tab').first().click()
  await page.locator('.message.user').getByRole('heading', { name: 'My question' }).waitFor()
  // Main chat text offers the same toolbar for both learner and assistant messages.
  await selectPassage(page.locator('.message.user .selectable-passage .markdown p').last())
  await selectPassage(page.locator('.message.assistant .selectable-passage .markdown p').last())
  await page.getByRole('tab').nth(1).click()
  await page.locator('.reference-chips .reference-chip').nth(1).waitFor()
  const messageQuotes = await page.evaluate(() => {
    const id = localStorage.getItem('noctua-current-chat')
    return JSON.parse(localStorage.getItem('noctua-tab-workspaces'))[id].references
  })
  assert.deepEqual(
    messageQuotes.map((quote) => quote.messageRole),
    ['user', 'assistant']
  )
  assert(messageQuotes.every((quote) => quote.messageId && quote.context?.kind === 'message'))
  await page.getByLabel('Message Noctua').fill('Discuss these chat quotations')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await page.getByRole('button', { name: 'Stop response' }).waitFor({ state: 'hidden' })
  await waitForApp(
    page,
    async (id) => {
      const messages = await window.noctua.request({ action: 'messages', conversationId: id })
      return messages.some((message) => message.references?.some((quote) => quote.messageId))
    },
    usedSecondTabId
  )
  assert(
    requests.some((request) =>
      request.messages.some((message) => /"messageRole":"assistant"/.test(messageText(message)))
    )
  )
  await page.getByRole('tab').first().click()
  await page.locator('.pdf-page-surface .textLayer span').first().waitFor()
  await page.locator('.pdf-page-surface .textLayer').first().scrollIntoViewIfNeeded()
  await page
    .locator('.pdf-page-surface .textLayer')
    .first()
    .evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    })
  await page.getByRole('button', { name: '+ New chat', exact: true }).click()
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.chat-area > .chat-tabs .chat-tab:not(.study-tab) [role=tab]')
        .length === 3 && document.querySelectorAll('.reference-chips .reference-chip').length === 1
  )
  assert.equal(await page.getByRole('toolbar', { name: 'Add selection to chat' }).count(), 0)
  console.log(
    'PASS: empty tab disposal, isolated chat tabs, floating direct-add/new-chat controls, source/message context, chat/Markdown/card/PDF selections, restart and reopen'
  )
  discoveredModels.push('qwen3.8-synthetic')
  await page.evaluate(async () => {
    await window.noctua.request({ action: 'models' })
    const current = await window.noctua.request({ action: 'snapshot' })
    await window.noctua.request({
      action: 'settings',
      settings: { ...current.settings, modelKey: 'noctua-local/qwen3.8-synthetic' }
    })
  })
  await page.locator('.model-button').filter({ hasText: 'qwen3.8-synthetic' }).waitFor()
  const qwenOption = (await snapshot(page)).models.find((model) => model.id === 'qwen3.8-synthetic')
  assert.deepEqual(qwenOption.reasoningEfforts, ['off', 'low', 'medium', 'xhigh'])
  assert.equal(await page.getByLabel('Reasoning effort', { exact: true }).isDisabled(), false)
  await page.getByLabel('Reasoning effort', { exact: true }).hover()
  await page.getByRole('button', { name: 'Xhigh', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByLabel('Message Noctua').fill('Synthetic reasoning wire check')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await page.getByRole('button', { name: 'Stop response' }).waitFor({ state: 'hidden' })
  assert.equal(
    requests.findLast((request) => request.model === 'qwen3.8-synthetic').reasoning_effort,
    'xhigh'
  )
  await page.getByLabel('Reasoning effort', { exact: true }).hover()
  await page.getByRole('button', { name: 'Off', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByLabel('Message Noctua').fill('Synthetic reasoning disabled wire check')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await page.getByRole('button', { name: 'Stop response' }).waitFor({ state: 'hidden' })
  assert.equal(
    requests.findLast((request) => request.model === 'qwen3.8-synthetic').reasoning_effort,
    'none'
  )
  console.log(
    'PASS: Ollama model capability discovery enables Qwen slider and real Pi requests carry xhigh/none'
  )
  // Mount the production slider with synthetic capabilities, independent of provider auth.
  const fixtureBundle = path.join(directory, 'reasoning-fixture.js')
  await bundleFixture({
    stdin: {
      contents: `import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
        import {ReasoningPicker} from './src/renderer/src/ReasoningPicker';
        function Fixture() { const [value, setValue] = useState('low');
          return <div style={{position:'absolute',right:180,bottom:60}}>
            <ReasoningPicker levels={['off','low','medium','high']} value={value} disabled={false}
              onChange={next => {window.lastEffort=next; setValue(next)}} />
          </div> }
        createRoot(document.getElementById('root')).render(<Fixture/>);`,
      loader: 'tsx',
      resolveDir: process.cwd()
    },
    bundle: true,
    platform: 'browser',
    jsx: 'automatic',
    outfile: fixtureBundle,
    define: { 'process.env.NODE_ENV': '"production"' }
  })
  const fixtureHtml = path.join(directory, 'reasoning-fixture.html')
  await writeFile(
    fixtureHtml,
    `<html><head><style>${await readFile('src/renderer/src/styles.css', 'utf8')}</style></head>
    <body><div id="root"></div><script src="reasoning-fixture.js"></script></body></html>`
  )
  const fixtureWindow = electron.waitForEvent('window')
  await electron.evaluate(async ({ BrowserWindow }, file) => {
    const window = new BrowserWindow({
      width: 480,
      height: 240,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
    })
    await window.loadFile(file)
  }, fixtureHtml)
  const fixturePage = await fixtureWindow
  await fixturePage.getByLabel('Reasoning effort', { exact: true }).hover()
  const slider = fixturePage.getByRole('slider', { name: 'Reasoning effort slider' })
  await slider.waitFor()
  const reasoningButtonBounds = await fixturePage
    .getByLabel('Reasoning effort', { exact: true })
    .boundingBox()
  const reasoningMenuBounds = await fixturePage.locator('.reasoning-popover').boundingBox()
  assert.ok(
    Math.abs(
      reasoningButtonBounds.x +
        reasoningButtonBounds.width / 2 -
        reasoningMenuBounds.x -
        reasoningMenuBounds.width / 2
    ) < 2,
    'reasoning popup centers over its trigger'
  )
  await slider.focus()
  await slider.press('ArrowRight')
  await fixturePage.waitForFunction(() => window.lastEffort === 'medium')
  await fixturePage.getByRole('button', { name: 'High', exact: true }).click()
  await fixturePage.waitForFunction(() => window.lastEffort === 'high')
  await fixturePage.screenshot({ path: path.join(artifacts, '15-reasoning-slider.png') })
  await fixturePage.keyboard.press('Escape')
  assert.equal(await slider.count(), 0)
  await fixturePage.close()
  console.log(
    'PASS: production reasoning slider hover, supported steps, keyboard/button selection, and Escape with synthetic capabilities'
  )
  // V1 shared ecosystem: manual graph/capture, reviewed notes, rendered PDF and tutor desk return.
  await page.getByRole('button', { name: 'Concept map', exact: true }).click()
  await page.getByTitle('Hide study desk').click()
  await page.getByTitle('Show study desk').click()
  assert.equal(
    await page.getByRole('tab', { name: 'Concept map', exact: true }).getAttribute('aria-selected'),
    'true'
  )
  await page.getByRole('button', { name: 'New concept', exact: true }).click()
  await page.locator('.concept-editor').getByLabel('Name', { exact: true }).fill('API quota')
  await page
    .locator('.concept-editor')
    .getByLabel('Meaning and scope')
    .fill('A limit on requests under concrete provider constraints.')
  await page.locator('.concept-editor').getByLabel('Facets to explore').fill('Rate limits\nRetries')
  await page
    .locator('.concept-editor')
    .getByRole('button', { name: 'Save concept', exact: true })
    .click()
  await page.getByRole('button', { name: 'API quota, not assessed', exact: true }).waitFor()
  await page.getByRole('button', { name: 'API quota, not assessed', exact: true }).click()
  await page.screenshot({ path: path.join(artifacts, '16-concept-map.png') })
  await page.getByRole('button', { name: 'Add concept to chat', exact: false }).click()
  await page.locator('.reference-chip').filter({ hasText: 'API quota' }).waitFor()
  assert.equal(
    await page.getByRole('tab', { name: 'Concept map', exact: true }).getAttribute('aria-selected'),
    'false'
  )
  const ecosystemChat = await page.evaluate(async () => {
    const current = await window.noctua.request({ action: 'snapshot' })
    const id = localStorage.getItem('noctua-current-chat')
    const quota = current.concepts.find((c) => c.title === 'API quota')
    const other = current.concepts.find((c) => c.scope === current.vaultScope && c.id !== quota.id)
    await window.noctua.request({
      action: 'saveEdge',
      edge: {
        fromId: quota.id,
        toId: other.id,
        relation: 'prerequisite',
        rationale: 'Synthetic relationship for exercising shared graph operations.'
      }
    })
    return { id, conceptId: quota.id }
  })
  await openStudy(page, 'Notes')
  await page
    .getByLabel('A bit worth keeping')
    .fill('Retrying requests needs a budget; unlimited retries amplify overload.')
  await page.getByLabel('Concept for this bit').selectOption(ecosystemChat.conceptId)
  await page.getByRole('button', { name: 'Keep this bit', exact: true }).click()
  await page
    .getByText('Retrying requests needs a budget; unlimited retries amplify overload.', {
      exact: true
    })
    .waitFor()
  const pending = await page.evaluate(async ({ id }) => {
    const current = await window.noctua.request({ action: 'snapshot' })
    const bit = current.bits.find((b) => b.text.startsWith('Retrying requests'))
    const proposal = await window.noctua.request({
      action: 'proposeNote',
      conversationId: id,
      proposal: {
        path: 'Mechanics.md',
        after: bit.text,
        rationale: 'Synthetic learner-selected note placement.',
        bitIds: [bit.id],
        conceptIds: bit.conceptIds,
        operation: 'append'
      }
    })
    return proposal
  }, ecosystemChat)
  assert.equal(
    pending.after,
    'Retrying requests needs a budget; unlimited retries amplify overload.'
  )
  assert.equal((await snapshot(page)).settings.vaultPath, await realpath(vault))
  assert(!(await readFile(path.join(vault, 'Mechanics.md'), 'utf8')).includes('Retrying'))
  await page.getByRole('tab', { name: /Changes/ }).click()
  await page.getByLabel('Select pending changes', { exact: true }).check()
  await page.getByRole('button', { name: /Accept selected/ }).click()
  await waitForApp(
    page,
    async (id) =>
      (await window.noctua.request({ action: 'snapshot' })).noteProposals.find((p) => p.id === id)
        ?.status === 'accepted',
    pending.id
  )
  const acceptedNote = await readFile(path.join(vault, 'Mechanics.md'), 'utf8')
  assert(
    acceptedNote.includes(pending.after),
    `The accepted synthetic change is missing: ${acceptedNote}`
  )
  state = await snapshot(page)
  assert(
    state.concepts
      .find((concept) => concept.id === ecosystemChat.conceptId)
      .sources.some((source) => source.text.includes(pending.after)),
    'accepted note placement is reachable from its concept'
  )
  await page.evaluate(
    (id) => window.noctua.request({ action: 'undoNote', proposalId: id }),
    pending.id
  )
  assert(!(await readFile(path.join(vault, 'Mechanics.md'), 'utf8')).includes('Retrying'))
  await page.screenshot({ path: path.join(artifacts, '17-capture-changes.png') })
  await page.evaluate(
    (conversationId) => window.noctua.request({ action: 'attach', conversationId }),
    ecosystemChat.id
  )
  await openStudy(page, 'Sources')
  await page.locator('.document-row').filter({ hasText: 'PDF' }).locator('button').first().click()
  await page.locator('.pdf-page-surface .textLayer span').first().waitFor()
  await page.locator('.pdf-page-surface canvas').first().waitFor()
  await page
    .locator('.pdf-page-surface .textLayer')
    .first()
    .evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    })
  await page.getByRole('button', { name: 'Highlight', exact: true }).click()
  await page.locator('.source-highlights blockquote').first().waitFor()
  state = await snapshot(page)
  assert(state.highlights.length === 1 && state.highlights[0].rects.length > 0)
  await page.getByRole('button', { name: 'Next PDF page', exact: true }).click()
  try {
    await page.waitForFunction(
      () =>
        document.querySelector('.pdf-page-surface[data-page="2"]') &&
        document.querySelector('[aria-label="PDF page"]').value === '2'
    )
  } catch (error) {
    console.error('PDF transition diagnostics:', await page.locator('.pdf-reader').innerText())
    await page.screenshot({ path: path.join(artifacts, '18-pdf-transition-failure.png') })
    throw error
  }
  await page.locator('.pdf-page-surface .textLayer span').first().waitFor()
  assert.equal(
    await page.locator('.pdf-page-surface[data-page="2"] .textLayer').textContent(),
    'Momentum equals mass times velocity. This is page two.',
    'the visible page, selection text and page identity agree after navigation'
  )
  await page.locator('[data-page-number="1"]').evaluate((element) => {
    const scroller = element.closest('.source-reader-document')
    scroller.style.maxHeight = '300px'
    scroller.scrollTop = 0
    scroller.dispatchEvent(new Event('scroll'))
  })
  await page.waitForFunction(() => document.querySelector('[aria-label="PDF page"]').value === '1')
  await page.locator('[data-page-number="2"]').evaluate((element) => {
    const scroller = element.closest('.source-reader-document')
    scroller.scrollTop +=
      element.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 38
  })
  await page.waitForFunction(() => document.querySelector('[aria-label="PDF page"]').value === '2')
  await page.screenshot({ path: path.join(artifacts, '18-pdf-reader.png') })
  await page.getByRole('button', { name: 'Back to study desk', exact: true }).click()
  // Exercise resurfacing and precise rubric annotations are durable, independent of chat turn order.
  const closed = await page.evaluate(async ({ id, conceptId }) => {
    const task = await window.noctua.request({
      action: 'saveExercise',
      conversationId: id,
      exercise: {
        title: 'Request budget',
        prompt: 'A service permits 12 calls and 4 are used. How many remain?',
        kind: 'knowledge',
        conceptId,
        solution: 'Eight calls remain.',
        criteria: ['Subtract used calls'],
        format: 'numeric',
        answerKey: '8',
        tolerance: 0
      }
    })
    const attempt = await window.noctua.request({
      action: 'answer',
      exerciseId: task.id,
      answer: '8\n12 minus 4 equals 8.',
      assistance: 0,
      solutionSeen: false,
      gradeWithModel: false
    })
    return { task, attempt }
  }, ecosystemChat)
  assert.equal(closed.attempt.outcome, 'correct')
  assert.equal(closed.attempt.assessedBy, 'answer-key')
  state = await snapshot(page)
  assert(state.practiceSchedules.some((p) => p.exerciseId === closed.task.id))
  const continuationCount = () =>
    requests.filter((request) =>
      request.messages.some((message) => messageText(message).includes('<study_completion>'))
    ).length
  const returnsBefore = continuationCount()
  await page.evaluate(
    ({ id, exerciseId }) =>
      window.noctua.request({
        action: 'send',
        conversationId: id,
        text: `Open synthetic desk exercise ${exerciseId}`,
        sourceIds: []
      }),
    { id: ecosystemChat.id, exerciseId: closed.task.id }
  )
  await page
    .getByText('Try the request budget here, then we can discuss your result.', { exact: true })
    .waitFor()
  await page.getByRole('heading', { name: 'Request budget', exact: true }).waitFor()
  assert.equal(
    await page
      .locator('.study-surface:not([hidden]) > .desk-content')
      .last()
      .evaluate((element) => element.scrollTop),
    0,
    'tutor focus shows the beginning of the requested activity'
  )
  assert.equal(continuationCount(), returnsBefore)
  await page
    .getByRole('textbox', { name: 'Your exercise answer', exact: true })
    .fill('8\nI subtract the four used calls from twelve.')
  await page.getByRole('button', { name: 'Check answer', exact: true }).click()
  await waitForApp(
    page,
    async (chatId) =>
      (await window.noctua.request({ action: 'snapshot' })).handoffs.some(
        (handoff) => handoff.conversationId === chatId && handoff.resumedAt
      ),
    ecosystemChat.id
  )
  state = await snapshot(page)
  const finishedHandoff = state.handoffs.find(
    (handoff) => handoff.conversationId === ecosystemChat.id && handoff.resumedAt
  )
  assert.equal(finishedHandoff.status, 'completed')
  assert.equal(continuationCount(), returnsBefore + 1)
  const continuedRequest = requests.findLast((request) =>
    request.messages.some((message) => messageText(message).includes('<study_completion>'))
  )
  assert(
    !continuedRequest.tools.some((tool) => tool.function.name === 'focus_study'),
    'completion cannot trigger another automatic handoff'
  )
  assert(
    continuedRequest.messages.some((message) =>
      messageText(message).includes('I subtract the four used calls from twelve.')
    ),
    'continuation receives the actual saved attempt'
  )
  await page.evaluate(
    (handoffId) => window.noctua.request({ action: 'completeHandoff', handoffId }),
    finishedHandoff.id
  )
  assert.equal(continuationCount(), returnsBefore + 1, 'completed work resumes only once')
  await page.screenshot({ path: path.join(artifacts, '19-study-return.png') })
  console.log(
    'PASS: editable interactive concept tab and @ context, shared capture, grouped conflict-checked note acceptance/undo, faithful PDF highlights, numeric practice and automatic one-time tutor return'
  )
  const previousNoteChat = await page.evaluate(() => localStorage.getItem('noctua-current-chat'))
  await page.getByRole('button', { name: 'New conversation', exact: true }).click()
  await page.waitForFunction(
    (previous) =>
      localStorage.getItem('noctua-current-chat') !== previous &&
      document.querySelectorAll('.message').length === 0,
    previousNoteChat
  )
  const sendNotePrompt = async (text) => {
    const previous = await page
      .locator('.message.assistant .response-work-heading')
      .filter({ hasText: /^Worked/ })
      .count()
    await page.getByLabel('Message Noctua').fill(text)
    await page.getByRole('button', { name: 'Send message', exact: true }).click()
    await page
      .locator('.message.assistant .response-work-heading')
      .filter({ hasText: /^Worked/ })
      .nth(previous)
      .waitFor()
    await page
      .getByRole('button', { name: 'Stop response', exact: true })
      .waitFor({ state: 'hidden' })
  }
  await sendNotePrompt('synthetic note create')
  const modelNote = path.join(vault, 'Model notes/Practice context.md')
  assert((await readFile(modelNote, 'utf8')).includes('model-authored explanation'))
  await sendNotePrompt('synthetic note edit')
  assert((await readFile(modelNote, 'utf8')).includes('additional scoped explanation'))
  const modelChanges = (await snapshot(page)).noteProposals.filter(
    (proposal) =>
      proposal.path === 'Model notes/Practice context.md' && proposal.status === 'accepted'
  )
  assert.equal(modelChanges.length, 2)
  assert(modelChanges.every((proposal) => proposal.appliedBy === 'model'))
  await page.evaluate(
    (id) => window.noctua.request({ action: 'undoNote', proposalId: id }),
    modelChanges.at(-1).id
  )
  assert(!(await readFile(modelNote, 'utf8')).includes('additional scoped explanation'))
  await page.evaluate(
    (id) => window.noctua.request({ action: 'undoNote', proposalId: id }),
    modelChanges[0].id
  )
  await assert.rejects(readFile(modelNote, 'utf8'), { code: 'ENOENT' })
  console.log('PASS: direct model note creation/editing through Pi, model provenance and undo')
  await electron.evaluate(
    ({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
    },
    path.join(vault, 'diagram.png')
  )
  await dropAttachment(page, path.join(vault, 'diagram.png'))
  const imagePreview = page
    .locator('.selected-sources .attachment-preview')
    .filter({ has: page.locator('img') })
    .first()
  await imagePreview.waitFor()
  assert(await imagePreview.locator('img').evaluate((img) => img.complete && img.naturalWidth > 0))
  await imagePreview.click()
  await page.locator('.image-reader img').waitFor()
  await page.getByRole('button', { name: 'Zoom in image', exact: true }).click()
  assert((await page.locator('.image-controls').textContent()).includes('125%'))
  await page.getByRole('button', { name: 'Reset image zoom', exact: true }).click()
  assert((await page.locator('.image-controls').textContent()).includes('100%'))
  await page.screenshot({ path: path.join(artifacts, '20-image-viewer.png') })
  console.log('PASS: image attachment square preview, main-tab viewer and zoom/reset')
  // CSV authoring uses the real file input, preload validation, SQLite and FSRS.
  await openStudy(page, 'Cards')
  if (await page.getByRole('button', { name: 'All flashcards', exact: true }).count())
    await page.getByRole('button', { name: 'All flashcards', exact: true }).click()
  const csvFile = path.join(directory, 'import-cards.csv')
  await writeFile(
    csvFile,
    'Answer;Question\n"CSV answer; with separator";CSV question one\nCSV answer two;CSV question two\nCSV answer two;CSV question two\n'
  )
  const countBeforeImport = (await snapshot(page)).cards.length
  await page.getByRole('button', { name: 'Import CSV / add batch', exact: true }).click()
  const importDialog = page.getByRole('dialog', { name: 'Add flashcards in batch' })
  await importDialog.locator('input[type=file]').setInputFiles(csvFile)
  await importDialog.getByText('3 cards · preview of first 3', { exact: true }).waitFor()
  assert.equal(await importDialog.getByLabel('CSV separator').inputValue(), ';')
  assert.equal(await importDialog.getByLabel('Question column').inputValue(), '1')
  assert.equal(await importDialog.getByLabel('Answer column').inputValue(), '0')
  assert.equal(await importDialog.getByLabel('First row is a header').isChecked(), true)
  await page.screenshot({ path: path.join(artifacts, '27-card-csv-import.png') })
  await importDialog.getByRole('button', { name: 'Add 3 cards', exact: true }).click()
  await importDialog.waitFor({ state: 'hidden' })
  assert.equal((await snapshot(page)).cards.length, countBeforeImport + 2)
  await page.reload()
  await openStudy(page, 'Cards')
  const imported = (await snapshot(page)).cards.filter(
    (card) => card.importInfo?.fileName === 'import-cards.csv'
  )
  assert.equal(imported.length, 2)
  const firstImported = page.locator('.library-card').filter({ hasText: 'CSV question one' })
  await firstImported.locator('.library-card-open').click()
  await page.getByRole('button', { name: 'Reveal answer' }).click()
  await page
    .getByRole('button', { name: 'Good', exact: false })
    .filter({ has: page.locator('strong') })
    .click()
  await page.getByRole('button', { name: 'All flashcards', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Select card: CSV question one', exact: true }).check()
  await page.getByRole('checkbox', { name: 'Select card: CSV question two', exact: true }).check()
  await page.getByRole('button', { name: 'Delete selected (2)', exact: true }).click()
  await page.getByRole('button', { name: 'Undo deletion (2)', exact: true }).waitFor()
  assert.equal((await snapshot(page)).cards.length, countBeforeImport)
  await page.getByRole('button', { name: 'Undo deletion (2)', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Select card: CSV question one', exact: true }).waitFor()
  assert.equal(
    (await snapshot(page)).cards.find((card) => card.id === imported[0].id).scheduler.reps,
    1
  )
  await page.getByRole('button', { name: 'Import CSV / add batch', exact: true }).click()
  await importDialog
    .getByLabel('Cards to import')
    .fill('Pasted question\tPasted answer\nPasted question two\tPasted answer two')
  await importDialog.getByRole('button', { name: 'Add 2 cards', exact: true }).click()
  await importDialog.waitFor({ state: 'hidden' })
  assert.equal((await snapshot(page)).cards.length, countBeforeImport + 4)
  console.log(
    'PASS: CSV file mapping/preview, duplicate skipping, restart, FSRS review, batch deletion/undo and pasted batch creation'
  )
  await newChatTab(page)
  await page.getByLabel('Message Noctua').fill('Show latex delimiter regression.')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('.streaming'))
  await page.locator('.message.assistant .markdown .katex').first().waitFor()
  const latexMessage = page.locator('.message.assistant').last()
  assert.equal(await latexMessage.locator('.katex').count(), 4)
  assert.equal(await latexMessage.locator('.katex-display').count(), 2)
  assert.equal(await latexMessage.locator('code').last().textContent(), '\\(literal\\)')
  const latexChat = await page.evaluate(() => localStorage.getItem('noctua-current-chat'))
  const savedLatex = await page.evaluate(
    (conversationId) => window.noctua.request({ action: 'messages', conversationId }),
    latexChat
  )
  assert.equal(savedLatex.filter((message) => message.role === 'assistant').at(-1).text, latexReply)
  await page.screenshot({ path: path.join(artifacts, '28-latex-delimiters.png') })
  await page.reload()
  await page.locator('.message.assistant .katex-display').first().waitFor()
  assert.equal(await page.locator('.message.assistant').last().locator('.katex').count(), 4)
  console.log(
    'PASS: all four LaTeX delimiters in model replies, literal code and verbatim text retained after reload'
  )
  console.log(`Desktop integration passed. Synthetic screenshots: ${artifacts}`)
} finally {
  await electron?.close()
  await new Promise((resolve) => server.close(resolve))
  // Retain screenshots for visual inspection, remove the synthetic profile and sources.
  await Promise.all([vault, data].map((folder) => rm(folder, { recursive: true, force: true })))
}
