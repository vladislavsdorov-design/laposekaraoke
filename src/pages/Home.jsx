import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  cancelEntry,
  computeEtaMinutes,
  createQueueEntry,
  formatEta,
  getSortedQueue,
  subscribeEntry,
  subscribeNowId,
  subscribeQueue,
} from '../lib/queue'
import { getOrCreateLocalId, readLocal, removeLocal, writeLocal } from '../lib/local'

const LOCAL_CLIENT_ID = 'lapose_client_id'
const LOCAL_ACTIVE_ID = 'lapose_active_request_id'

function normalizeText(value, max) {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length > max ? clean.slice(0, max) : clean
}

export default function Home() {
  const [queueMap, setQueueMap] = useState({})
  const [nowId, setNowId] = useState(null)
  const [activeId, setActiveId] = useState(() => readLocal(LOCAL_ACTIVE_ID))
  const [activeEntry, setActiveEntry] = useState(null)
  const [name, setName] = useState('')
  const [track, setTrack] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const prevStatusRef = useRef(null)

  useEffect(() => {
    getOrCreateLocalId(LOCAL_CLIENT_ID)
  }, [])

  useEffect(() => subscribeQueue(setQueueMap), [])
  useEffect(() => subscribeNowId(setNowId), [])

  useEffect(() => {
    const unsub = subscribeEntry(activeId, setActiveEntry)
    return () => unsub()
  }, [activeId])

  const order = useMemo(() => getSortedQueue(queueMap, ['pending', 'now']), [queueMap])
  const position = useMemo(() => {
    if (!activeId) return null
    const idx = order.findIndex((x) => x.id === activeId)
    return idx >= 0 ? idx + 1 : null
  }, [activeId, order])
  const aheadCount = useMemo(() => (position && position > 1 ? position - 1 : 0), [position])
  const etaText = useMemo(() => {
    const eta = computeEtaMinutes(position, 4)
    return formatEta(eta)
  }, [position])

  const effectiveStatus = useMemo(() => {
    if (!activeEntry) return null
    if (nowId && activeId && nowId === activeId) return 'now'
    return activeEntry.status || null
  }, [activeEntry, activeId, nowId])

  useEffect(() => {
    if (effectiveStatus === 'now' && prevStatusRef.current !== 'now') {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate([120, 80, 120])
      }
      if (typeof window !== 'undefined' && 'Notification' in window) {
        const title = 'LaPose Karaoke'
        const body = `Przygotuj sie: ${activeEntry?.name || 'Gosc'} — ${activeEntry?.track || 'Utwor'}`
        if (Notification.permission === 'granted') {
          new Notification(title, { body })
        } else if (Notification.permission === 'default') {
          Notification.requestPermission().then((permission) => {
            if (permission === 'granted') new Notification(title, { body })
          })
        }
      }
    }
    prevStatusRef.current = effectiveStatus
  }, [effectiveStatus, activeEntry])

  const canShowForm =
    !activeId ||
    !activeEntry ||
    ['done', 'no_track', 'cancelled', 'skipped'].includes(effectiveStatus)

  async function submit() {
    setError('')
    const cleanName = normalizeText(name, 28)
    const cleanTrack = normalizeText(track, 48)
    if (!cleanName) {
      setError('Wpisz imie albo pseudonim.')
      return
    }
    if (!cleanTrack) {
      setError('Wpisz tytul utworu.')
      return
    }

    setLoading(true)
    try {
      const clientId = getOrCreateLocalId(LOCAL_CLIENT_ID)
      const newId = await createQueueEntry({
        clientId,
        name: cleanName,
        track: cleanTrack,
      })
      writeLocal(LOCAL_ACTIVE_ID, newId)
      setActiveId(newId)
      setName('')
      setTrack('')
    } catch {
      setError('Blad wysylki. Sprawdz internet i sprobuj ponownie.')
    } finally {
      setLoading(false)
    }
  }

  function resetToForm() {
    removeLocal(LOCAL_ACTIVE_ID)
    setActiveId(null)
    setActiveEntry(null)
    setError('')
  }

  async function repeatSignup() {
    resetToForm()
  }

  async function cancelMySignup() {
    if (!activeId) return
    setCancelLoading(true)
    setError('')
    try {
      await cancelEntry(activeId)
      resetToForm()
    } catch {
      setError('Nie udalo sie anulowac zapisu. Sprobuj ponownie.')
    } finally {
      setCancelLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <div className="brand">
          <div className="brandMark">LaPose</div>
          <div className="brandSub">Kolejka karaoke</div>
        </div>
        {/* <div className="topbarRight">
          <Link className="link" to="/admindjvl">
            DJ
          </Link>
          <Link className="link" to="/dwaczelJG">
            Zapowiedzi
          </Link>
        </div> */}
      </div>

      <div className="grid">
        <div className="card">
          <div className="cardTitle">Zapis na karaoke</div>

          {canShowForm ? (
            <div className="form">
              <label className="label" htmlFor="name">
                Imie / pseudonim
              </label>
              <input
                id="name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Np. DJ Max"
                autoComplete="nickname"
                inputMode="text"
              />

              <label className="label" htmlFor="track">
                Utwor / muzyka
              </label>
              <input
                id="track"
                className="input"
                value={track}
                onChange={(e) => setTrack(e.target.value)}
                placeholder="Np. The Weeknd - Blinding Lights"
                inputMode="text"
              />

              {error ? <div className="error">{error}</div> : null}

              <button className="btn" type="button" onClick={submit} disabled={loading}>
                {loading ? 'Wysylanie...' : 'Wyslij'}
              </button>
            </div>
          ) : (
            <div className="status">
              {effectiveStatus === 'pending' ? (
                <>
                  <div className="statusTitle">Jestes w kolejce</div>
                  <div className="statusBig">{position ? `№${position}` : '—'}</div>
                  <div className="statusText">
                    Imie: <span className="mono">{activeEntry?.name || '—'}</span>
                  </div>
                  <div className="statusText">
                    Utwor: <span className="mono">{activeEntry?.track || '—'}</span>
                  </div>
                  <div className="statusText">
                    Przed toba: <span className="mono">{aheadCount}</span>
                  </div>
                  <div className="statusText">
                    Szacowany czas: <span className="mono">{etaText}</span>
                  </div>
                  <div className="hint">Kolejka aktualizuje sie automatycznie.</div>
                  <button
                    className="btn btnGhost"
                    type="button"
                    onClick={cancelMySignup}
                    disabled={cancelLoading}
                  >
                    {cancelLoading ? 'Anulowanie...' : 'Anuluj zapis'}
                  </button>
                </>
              ) : null}

              {effectiveStatus === 'now' ? (
                <>
                  <div className="statusTitle">Przygotuj sie - zaraz wchodzisz na scene</div>
                  <div className="statusBig">TERAZ</div>
                  <div className="statusText">
                    <span className="mono">{activeEntry?.name}</span> —{' '}
                    <span className="mono">{activeEntry?.track}</span>
                  </div>
                </>
              ) : null}

              {effectiveStatus === 'no_track' ? (
                <>
                  <div className="statusTitle">Przepraszamy, ale niestety nie ma takiego utworu</div>
                  <div className="statusText">Wybierz inny utwor i zapisz sie ponownie.</div>
                  <button className="btn" type="button" onClick={repeatSignup}>
                    Wybierz inny utwor
                  </button>
                </>
              ) : null}

              {effectiveStatus === 'done' ? (
                <>
                  <div className="statusTitle">Gotowe</div>
                  <div className="statusText">Jesli chcesz, mozesz zapisac sie ponownie.</div>
                  <button className="btn" type="button" onClick={resetToForm}>
                    Zapisz sie ponownie
                  </button>
                </>
              ) : null}

              {effectiveStatus === 'skipped' ? (
                <>
                  <div className="statusTitle">Zostales pominiety</div>
                  <div className="statusText">Zapisz sie ponownie, gdy bedziesz gotowy.</div>
                  <button className="btn" type="button" onClick={resetToForm}>
                    Zapisz sie ponownie
                  </button>
                </>
              ) : null}

              {effectiveStatus === 'cancelled' ? (
                <>
                  <div className="statusTitle">Zapis anulowany</div>
                  <button className="btn" type="button" onClick={resetToForm}>
                    Zapisz sie ponownie
                  </button>
                </>
              ) : null}
            </div>
          )}
        </div>

        <div className="card">
          <div className="cardTitle">Aktualna kolejka</div>
          <div className="queueMini">
            {order.length === 0 ? (
              <div className="hint">Na razie pusto.</div>
            ) : (
              order.slice(0, 10).map((x, idx) => (
                <div
                  key={x.id}
                  className={[
                    'queueRow',
                    x.status === 'now' || x.id === nowId ? 'queueRowNow' : '',
                    x.id === activeId ? 'queueRowMe' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="queueNum">{idx + 1}</div>
                  <div className="queueMain">
                    <div className="queueName">{x.name || '—'}</div>
                    <div className="queueTrack">{x.track || '—'}</div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="hint">Pokazuje pierwsze 10 osob. Aktywnych lacznie: {order.length}.</div>
        </div>
      </div>
    </div>
  )
}
