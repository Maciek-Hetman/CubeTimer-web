import { useState } from 'react'
import { useSolves } from '../../contexts/SolvesContext'
import { Alert } from '../../ui/Alert'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'

export function SessionManager({ onClose }: { onClose: () => void }) {
  const { sessions, currentSession, createSession, renameSession, switchSession, removeSession } = useSolves()
  const [name, setName] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmCount, setConfirmCount] = useState(0)
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({})

  return (
    <Dialog
      title="Sessions"
      labelledBy="session-title"
      onClose={onClose}
      footer={
        <Button type="button" onClick={onClose}>
          Close
        </Button>
      }
    >
      <form
        className="row wrap"
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
          style={{ flex: 1, minWidth: 160 }}
        />
        <Button type="submit" variant="primary">
          Create
        </Button>
      </form>
      <div className="stack">
        {sessions.length === 0 ? <p className="muted">No sessions yet.</p> : null}
        {sessions.map((session) => {
          const draft = renameDrafts[session.id] ?? session.name
          return (
            <div key={session.id} className="panel stack">
              <div className="row wrap" style={{ justifyContent: 'space-between' }}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void switchSession(session.id).then(onClose)}
                >
                  {session.name}
                  {currentSession?.id === session.id ? ' (current)' : ''}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    setConfirmId(session.id)
                    setConfirmCount(0)
                  }}
                >
                  Delete
                </Button>
              </div>
              <label className="field">
                Rename
                <input
                  value={draft}
                  aria-label={`Rename ${session.name}`}
                  onChange={(event) =>
                    setRenameDrafts((current) => ({ ...current, [session.id]: event.target.value }))
                  }
                  onBlur={() => {
                    const next = draft.trim()
                    if (next && next !== session.name) {
                      void renameSession(session.id, next)
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur()
                    }
                  }}
                />
              </label>
            </div>
          )
        })}
      </div>
      {confirmId ? (
        <div className="panel stack">
          <p style={{ margin: 0 }}>Delete this session and all of its times? This cannot be undone.</p>
          <div className="row wrap">
            <Button type="button" onClick={() => setConfirmId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                void removeSession(confirmId).then((count) => {
                  setConfirmCount(count)
                  setConfirmId(null)
                })
              }}
            >
              Delete session
            </Button>
          </div>
        </div>
      ) : null}
      {confirmCount > 0 ? <Alert tone="success" role="status">Removed {confirmCount} solves.</Alert> : null}
    </Dialog>
  )
}
