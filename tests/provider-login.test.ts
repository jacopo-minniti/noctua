import { describe, it, expect, vi } from 'vitest'
import type { AuthInteraction, Credential } from '@earendil-works/pi-ai'
import { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { AppCredentials, ProviderSignIn } from '../src/main/provider-login'
import { Store } from '../src/main/store'
import { Keys, PiHarness } from '../src/main/pi'
import { Vault } from '../src/main/vault'

const credential: Credential = {
  type: 'oauth',
  access: 'synthetic-access',
  refresh: 'synthetic-refresh',
  expires: Date.now() + 3600000
}
const codec = {
  encrypt: (text: string) => Buffer.from(text).toString('base64'),
  decrypt: (text: string) => Buffer.from(text, 'base64').toString()
}
describe('provider sign-in boundaries', () => {
  it('encrypts and restores credentials, serializes refresh, and durably disconnects', async () => {
    const store = new Store(':memory:')
    try {
      const first = new AppCredentials(store, codec)
      await first.restore()
      await first.modify('openai', async () => credential)
      expect(JSON.stringify(store.meta('encrypted-provider-logins', {}))).not.toContain(
        'synthetic-access'
      )
      const restarted = new AppCredentials(store, codec)
      await restarted.restore()
      expect(await restarted.read('openai')).toEqual(credential)
      await Promise.all([
        restarted.modify('openai', async (current) => ({ ...current!, access: 'rotated' })),
        restarted.delete('openai')
      ])
      const disconnected = new AppCredentials(store, codec)
      await disconnected.restore()
      expect(await disconnected.read('openai')).toBeUndefined()
      const temporary = new AppCredentials(store, { ...codec, encrypt: () => null })
      await temporary.modify('openai', async () => credential)
      expect(await temporary.read('openai')).toEqual(credential)
      expect(store.meta('encrypted-provider-logins', {})).toEqual({})
    } finally {
      store.close()
    }
  })
  it('uses real Pi login and refresh machinery with encrypted app storage', async () => {
    const store = new Store(':memory:')
    try {
      const credentials = new AppCredentials(store, codec)
      await credentials.restore()
      const runtime = await ModelRuntime.create({
        credentials,
        modelsPath: null,
        refreshOnCreate: false
      })
      const provider = runtime.getProvider('openai')!
      const refresh = vi.fn(async (current: import('@earendil-works/pi-ai').OAuthCredential) => ({
        ...current,
        access: 'refreshed-access',
        expires: Date.now() + 3600000
      }))
      runtime.registerNativeProvider({
        ...provider,
        auth: {
          ...provider.auth,
          oauth: {
            ...provider.auth!.oauth!,
            login: async () => ({ ...credential, type: 'oauth' as const }),
            refresh,
            toAuth: async (current) => ({ apiKey: current.access })
          }
        }
      })
      await runtime.login('openai', 'oauth', { prompt: async () => '', notify: () => {} })
      expect(runtime.isUsingOAuth('openai')).toBe(true)
      expect(runtime.hasConfiguredAuth('openai')).toBe(true)
      const gptModels = runtime
        .getModels('openai')
        .filter((model) => /^gpt-(?:5\.6|6)/.test(model.id))
      expect(gptModels.length).toBeGreaterThan(1)
      expect(gptModels.every((model) => runtime.hasConfiguredAuth(model.provider))).toBe(true)
      await credentials.modify('openai', async () => ({ ...credential, expires: 1 }))
      const auth = await runtime.getAuth('openai')
      expect(auth?.auth.apiKey).toBe('refreshed-access')
      expect(refresh).toHaveBeenCalledOnce()
      const restarted = new AppCredentials(store, codec)
      await restarted.restore()
      expect((await restarted.read('openai'))?.type).toBe('oauth')
      expect(JSON.stringify(store.meta('encrypted-provider-logins', {}))).not.toContain(
        'refreshed-access'
      )
      await runtime.logout('openai')
      expect(await credentials.read('openai')).toBeUndefined()
      expect(store.meta('encrypted-provider-logins', {})).toEqual({})
    } finally {
      store.close()
    }
  })
  it('opens only trusted sign-in URLs, accepts a pending fallback, and hides tokens from status', async () => {
    const open = vi.fn(async () => {})
    const connected = vi.fn(async () => {})
    const flow = new ProviderSignIn(() => {}, open)
    const login = vi.fn(async (_provider: string, _type: string, interaction: AuthInteraction) => {
      interaction.notify({
        type: 'auth_url',
        url: 'https://auth.openai.com/oauth/authorize?state=synthetic'
      })
      expect(await interaction.prompt({ type: 'manual_code', message: 'Paste redirect' })).toBe(
        'synthetic-code'
      )
      return credential
    })
    flow.start({ login } as unknown as ModelRuntime, 'openai', 'urn:uuid:synthetic', connected)
    expect(flow.state.prompt?.message).toBe('Paste redirect')
    expect(open).toHaveBeenCalledOnce()
    expect(() =>
      flow.start({ login } as unknown as ModelRuntime, 'openai', 'test', connected)
    ).toThrow('already')
    flow.submit('synthetic-code')
    await vi.waitFor(() => expect(flow.state.status).toBe('connected'))
    expect(connected).toHaveBeenCalledOnce()
    expect(JSON.stringify(flow.state)).not.toContain('synthetic-access')
    expect(() => flow.submit('stale-code')).toThrow('No sign-in')
    const bad = new ProviderSignIn(() => {}, open)
    bad.start(
      {
        login: async (_p: string, _t: string, interaction: AuthInteraction) => {
          interaction.notify({ type: 'auth_url', url: 'file:///private' })
          return credential
        }
      } as unknown as ModelRuntime,
      'openai',
      'test',
      connected
    )
    await vi.waitFor(() => expect(bad.state.status).toBe('error'))
    expect(open).toHaveBeenCalledOnce()
  })
  it('cancels a pending login and permits retry without retaining the fallback prompt', async () => {
    const flow = new ProviderSignIn(
      () => {},
      async () => {}
    )
    const login = async (_p: string, _t: string, interaction: AuthInteraction) => {
      await interaction.prompt({
        type: 'manual_code',
        message: 'Paste redirect',
        signal: interaction.signal
      })
      return credential
    }
    const connected = vi.fn(async () => {})
    flow.start({ login } as unknown as ModelRuntime, 'openai', 'test', connected)
    await flow.cancel()
    expect(flow.state.status).toBe('error')
    expect(flow.state.prompt).toBeUndefined()
    expect(connected).not.toHaveBeenCalled()
    expect(flow.active).toBe(false)
  })
})

describe('model discovery with a saved subscription', () => {
  it('retains provider readiness on startup, focus/periodic scans and settings saves', async () => {
    const store = new Store(':memory:')
    const selected = 'openai/gpt-6-luna'
    store.settings = {
      ...store.settings,
      modelKey: selected,
      openaiAuthMode: 'subscription',
      localModelIds: []
    }
    store.setMeta('encrypted-provider-logins', {
      openai: codec.encrypt(JSON.stringify(credential))
    })
    const pi = new PiHarness(
      store,
      new Vault(store, () => {}),
      new Keys(store, codec),
      '/tmp/noctua-synthetic-readiness',
      () => {}
    )
    const refresh = ModelRuntime.prototype.refresh
    const scans: string[][] = []
    vi.spyOn(ModelRuntime.prototype, 'refresh').mockImplementation(async function (
      this: ModelRuntime,
      options = {}
    ) {
      if (options.allowNetwork) scans.push([...(options.providers || [])])
      // Keep the real SDK auth/catalog mechanics while suppressing external catalog requests.
      return refresh.call(this, { ...options, allowNetwork: false })
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [] }), {
            headers: { 'content-type': 'application/json' }
          })
      )
    )
    try {
      for (const scan of [true, false, true, true]) {
        const models = await pi.configure(scan)
        expect(models.find((model) => model.key === selected)).toMatchObject({ ready: true })
        expect(pi.subscriptionConnected).toBe(true)
        expect(store.settings.modelKey).toBe(selected)
      }
      expect(scans).toHaveLength(3)
      expect(scans.every((providers) => providers.includes('openai'))).toBe(true)
      expect(scans.every((providers) => !providers.includes('openai-codex'))).toBe(true)
    } finally {
      await pi.shutdown()
      store.close()
      vi.restoreAllMocks()
      vi.unstubAllGlobals()
    }
  })
})
