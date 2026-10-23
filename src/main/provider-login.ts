import {
  InMemoryCredentialStore,
  type Credential,
  type AuthInteraction
} from '@earendil-works/pi-ai'
import type { ModelRuntime } from '@earendil-works/pi-coding-agent'
import type { ProviderLogin } from '../shared/types'
import type { Store } from './store'
import type { SecretCodec } from './pi'

// Refresh and login writes share the SDK's per-provider lock. Secrets never enter IPC snapshots.
export class AppCredentials extends InMemoryCredentialStore {
  private restored = false
  private chain: Promise<unknown> = Promise.resolve()
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.chain.then(operation, operation)
    this.chain = pending.catch(() => {})
    return pending
  }
  constructor(
    private store: Store,
    private codec: SecretCodec
  ) {
    super()
  }
  async restore() {
    if (this.restored) return
    this.restored = true
    for (const [provider, cipher] of Object.entries(
      this.store.meta<Record<string, string>>('encrypted-provider-logins', {})
    )) {
      try {
        const credential = JSON.parse(this.codec.decrypt(cipher)) as Credential
        if (credential.type === 'oauth') await super.modify(provider, async () => credential)
      } catch {
        /* Locked OS storage requires signing in again; no plaintext fallback. */
      }
    }
  }
  override async modify(
    provider: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    options?: { signal?: AbortSignal }
  ) {
    return this.serialize(() =>
      super.modify(
        provider,
        async (current) => {
          const next = await fn(current)
          if (next) {
            const saved = this.store.meta<Record<string, string>>('encrypted-provider-logins', {})
            const cipher = this.codec.encrypt(JSON.stringify(next))
            if (cipher) saved[provider] = cipher
            else delete saved[provider]
            this.store.setMeta('encrypted-provider-logins', saved)
          }
          return next
        },
        options
      )
    )
  }
  override async delete(provider: string, options?: { signal?: AbortSignal }) {
    await this.serialize(async () => {
      const saved = this.store.meta<Record<string, string>>('encrypted-provider-logins', {})
      delete saved[provider]
      this.store.setMeta('encrypted-provider-logins', saved)
      await super.delete(provider, options)
    })
  }
}

export class ProviderSignIn {
  state: ProviderLogin = { status: 'idle', message: '' }
  private controller: AbortController | null = null
  private reply: ((text: string) => void) | null = null
  private operation: Promise<void> | null = null
  constructor(
    private changed: () => void,
    private openLink: (url: string) => Promise<void>
  ) {}
  get active() {
    return !!this.operation
  }
  start(
    runtime: ModelRuntime,
    provider: 'openai' | 'openai-codex',
    deviceId: string,
    connected: () => Promise<void>
  ) {
    if (this.active) throw new Error('A sign-in is already in progress.')
    const controller = new AbortController()
    this.controller = controller
    this.state = { status: 'waiting', message: 'Opening browser sign-in…' }
    this.changed()
    const interaction: AuthInteraction = {
      signal: controller.signal,
      notify: (event) => {
        if (event.type === 'auth_url') {
          const url = new URL(event.url)
          if (url.protocol !== 'https:' || url.hostname !== 'auth.openai.com')
            throw new Error('Unexpected sign-in address.')
          this.state = {
            ...this.state,
            status: 'waiting',
            message: event.instructions || 'Complete sign-in in your browser.',
            url: event.url
          }
          void this.openLink(event.url).catch(() => {
            this.state.message = 'Open the sign-in link to continue.'
            this.changed()
          })
        } else if (event.type === 'progress' || event.type === 'info')
          this.state = { ...this.state, message: event.message }
        this.changed()
      },
      prompt: (prompt) =>
        new Promise<string>((resolve, reject) => {
          if (prompt.type !== 'manual_code' && prompt.type !== 'text') {
            reject(new Error('Unsupported sign-in prompt.'))
            return
          }
          const signal = prompt.signal || controller.signal
          const abort = () => {
            this.reply = null
            this.state = { ...this.state, prompt: undefined }
            signal.removeEventListener('abort', abort)
            reject(new Error('Sign-in step cancelled.'))
          }
          if (signal.aborted) {
            abort()
            return
          }
          this.reply = (text) => {
            this.reply = null
            signal.removeEventListener('abort', abort)
            this.state = { ...this.state, prompt: undefined }
            resolve(text)
            this.changed()
          }
          signal.addEventListener('abort', abort, { once: true })
          this.state = {
            ...this.state,
            prompt: { message: prompt.message, placeholder: prompt.placeholder }
          }
          this.changed()
        })
    }
    const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000)
    this.operation = (async () => {
      try {
        await runtime.login(provider, 'oauth', interaction, {
          getDeviceId: () => deviceId.replace(/^urn:uuid:/, '')
        })
        if (controller.signal.aborted) throw new Error('Sign-in cancelled.')
        await connected()
        this.state = {
          status: 'connected',
          message: 'Connected. Choose your model in the composer.'
        }
      } catch (error) {
        this.state = {
          status: 'error',
          message: controller.signal.aborted
            ? 'Sign-in cancelled or timed out. You can try again.'
            : error instanceof Error && /Port .*in use/.test(error.message)
              ? 'Another Pi/Codex sign-in is using the callback port. Cancel it and try again.'
              : 'Sign-in could not be completed. Check browser authorization and try again.'
        }
      } finally {
        clearTimeout(timeout)
        this.reply = null
        this.controller = null
        this.operation = null
        this.changed()
      }
    })()
  }
  submit(text: string) {
    if (!this.reply) throw new Error('No sign-in step is waiting for a response.')
    this.reply(text)
  }
  async cancel() {
    this.controller?.abort()
    await this.operation
  }
}
