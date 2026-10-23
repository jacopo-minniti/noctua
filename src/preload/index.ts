import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { Bridge, Event, Request } from '../shared/types'
const bridge: Bridge = {
  attachFiles: (conversationId, files) =>
    ipcRenderer.invoke('noctua:request', {
      action: 'attach',
      conversationId,
      paths: files.slice(0, 10).map((file) => webUtils.getPathForFile(file))
    }),
  request: <T>(request: Request) => ipcRenderer.invoke('noctua:request', request) as Promise<T>,
  onEvent(callback) {
    const listener = (_event: Electron.IpcRendererEvent, event: Event) => callback(event)
    ipcRenderer.on('noctua:event', listener)
    return () => ipcRenderer.removeListener('noctua:event', listener)
  }
}
contextBridge.exposeInMainWorld('noctua', bridge)
