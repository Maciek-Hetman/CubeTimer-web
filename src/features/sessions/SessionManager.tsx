import { useState } from 'react'
import { useApp } from '../../app/AppProviders'

export function SessionManager({ onClose }: { onClose: () => void }) {
  const { sessions, currentSession, createSession, renameSession, switchSession, removeSession } = useApp()
  const [name, setName] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmCount, setConfirmCount] = useState(0)

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-labelledby="session-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="session-title">Sessions</h2>
        <form
          className="row"
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim()) {
              return
            }
            void createSession(name.trim()).then(() => setName(''))
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New session name"
            aria-label="New session name"
          />
          <button type="submit" className="btn primary">
            Create
          </button>
        </form>
        <div className="stack" style={{ marginTop: 12 }}>
          {sessions.length === 0 ? <p className="muted">No sessions yet.</p> : null}
          {sessions.map((session) => (
            <div key={session.id} className="panel">
              <div className="row wrap" style={{ justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => void switchSession(session.id).then(onClose)}
                >
                  {session.name}
                  {currentSession?.id === session.id ? ' (current)' : ''}
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => {
                    setConfirmId(session.id)
                    setConfirmCount(0)
                  }}
                >
                  Delete
                </button>
              </div>
              <input
                defaultValue={session.name}
                aria-label={`Rename ${session.name}`}
                onBlur={(event) => {
                  const next = event.target.value.trim()
                  if (next && next !== session.name) {
                    void renameSession(session.id, next)
                  }
                }}
              />
            </div>
          ))}
        </div>
        {confirmId ? (
          <div className="panel" style={{ marginTop: 12 }}>
            <p>Delete this session and all of its times? This cannot be undone.</p>
            <div className="row wrap">
              <button type="button" className="btn" onClick={() => setConfirmId(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  void removeSession(confirmId).then((count) => {
                    setConfirmCount(count)
                    setConfirmId(null)
                  })
                }}
              >
                Delete session
              </button>
            </div>
            {confirmCount > 0 ? <p className="muted">Removed {confirmCount} solves.</p> : null}
          </div>
        ) : null}
        <button type="button" className="btn" style={{ marginTop: 12 }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
