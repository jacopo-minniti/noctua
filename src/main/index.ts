import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell, Menu } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { Application } from './application'

const dirname = path.dirname(fileURLToPath(import.meta.url))
app.setName('Noctua')
if (process.env.NOCTUA_DATA_DIR) app.setPath('userData', path.resolve(process.env.NOCTUA_DATA_DIR))
let window: BrowserWindow | null = null
let application: Application
let quitting = false

function createWindow(): void {
  window = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 900,
    minHeight: 600,
    title: 'Noctua',
    backgroundColor: '#f1f2ed',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 20 },
    webPreferences: {
      preload: path.join(dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false)
  )
  if (process.env.ELECTRON_RENDERER_URL && !app.isPackaged)
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void window.loadFile(path.join(dirname, '../renderer/index.html'))
  window.on('closed', () => {
    window = null
  })
}

// Electron waits for ESM entry evaluation before emitting ready. A top-level
// await of whenReady would make startup wait on itself (and test drivers).
void app.whenReady().then(() => {
  mkdirSync(app.getPath('userData'), { recursive: true, mode: 0o700 })
  application = new Application(
    app.getPath('userData'),
    {
      async chooseDirectory() {
        const result = await dialog.showOpenDialog(window!, {
          title: 'Connect your Markdown vault',
          properties: ['openDirectory']
        })
        return result.canceled ? null : result.filePaths[0]
      },
      async chooseFiles() {
        const result = await dialog.showOpenDialog(window!, {
          title: 'Add study sources',
          properties: ['openFile', 'multiSelections'],
          filters: [
            {
              name: 'Study sources',
              extensions: ['md', 'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp']
            }
          ]
        })
        return result.canceled ? [] : result.filePaths
      },
      async chooseExport() {
        const result = await dialog.showSaveDialog(window!, {
          title: 'Export Noctua study data',
          defaultPath: 'noctua-study-backup.json',
          filters: [
            { name: 'Full study backup', extensions: ['json'] },
            { name: 'Portable learning activities', extensions: ['md'] }
          ]
        })
        return result.canceled ? null : result.filePath || null
      },
      async openFile(file) {
        const error = await shell.openPath(file)
        if (error) throw new Error(error)
      },
      async openLink(url) {
        await shell.openExternal(url)
      }
    },
    (event) => window?.webContents.send('noctua:event', event),
    {
      encrypt(value) {
        return safeStorage.isEncryptionAvailable()
          ? safeStorage.encryptString(value).toString('base64')
          : null
      },
      decrypt(value) {
        return safeStorage.decryptString(Buffer.from(value, 'base64'))
      }
    }
  )
  ipcMain.handle('noctua:request', async (event, input: unknown) => {
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame
    )
      throw new Error('Request did not originate from Noctua.')
    if (quitting) return null
    return application.request(input)
  })
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Noctua',
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { role: 'togglefullscreen' }
        ]
      }
    ])
  )
  createWindow()
  void application
    .initialize()
    .then(() => window?.webContents.send('noctua:event', { type: 'changed' }))
    .catch((error) =>
      console.error(
        'Model discovery failed:',
        error instanceof Error ? error.message : 'Unknown error'
      )
    )
})
app.on('activate', () => {
  if (!window) createWindow()
})
app.on('window-all-closed', () => app.quit())
app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  if (!application) {
    app.quit()
    return
  }
  void application.close().finally(() => {
    app.quit()
  })
})
