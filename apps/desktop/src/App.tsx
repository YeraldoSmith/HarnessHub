import { useEffect, useState } from 'react'

import { registryResponseSchema } from '@harnesshub/plugin-schema'
import type { Plugin } from '@harnesshub/types'
import { IdentityBadge, PluginDetail } from '@harnesshub/ui'

export function App() {
  const [plugin, setPlugin] = useState<Plugin | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void fetch('http://127.0.0.1:3001/plugins', { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Registry request failed with status ${response.status}.`)
        return registryResponseSchema.parse(await response.json())
      })
      .then((registry) => {
        if (active) setPlugin(registry.data[0] ?? null)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Registry unavailable.')
      })

    return () => {
      active = false
    }
  }, [])

  return (
    <div className="desktop-shell">
      <aside className="desktop-sidebar">
        <div className="desktop-brand">
          <span aria-hidden="true">H</span>
          <div>
            <strong>HarnessHub</strong>
            <small>Desktop preview</small>
          </div>
        </div>

        <nav aria-label="Desktop navigation">
          <a className="active" href="#registry">
            Registry
          </a>
          <span>Developers</span>
          <span>Requests</span>
        </nav>

        <div className="desktop-scope-note">
          <strong>Phase 1-B</strong>
          <p>Read-only Registry. Install and account actions are not enabled.</p>
        </div>
      </aside>

      <main className="desktop-main" id="registry">
        <header className="desktop-toolbar">
          <div>
            <span>Plugin Registry</span>
            <strong>Foundation preview</strong>
          </div>
          <IdentityBadge kind="founder" />
        </header>

        <section className="desktop-content">
          <div className="desktop-intro">
            <div>
              <span>One validated record</span>
              <h1>Registry data, clearly explained.</h1>
            </div>
            <p>
              The desktop shell reads the same PostgreSQL-backed Registry API as the Web app. No local
              DSH command is exposed in this phase.
            </p>
          </div>
          {plugin ? <PluginDetail plugin={plugin} /> : null}
          {!plugin && !error ? <div className="desktop-message">Loading Registry snapshot…</div> : null}
          {error ? <div className="desktop-message desktop-message--error">{error}</div> : null}
        </section>
      </main>
    </div>
  )
}
