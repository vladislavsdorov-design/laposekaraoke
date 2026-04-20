import { useEffect, useMemo, useState } from 'react'
import AuthGate from '../components/AuthGate'
import {
  formatStatus,
  formatTrackLine,
  getNextAfterNow,
  getSortedQueue,
  subscribeNowId,
  subscribeQueue,
} from '../lib/queue'

export default function Announcer() {
  return (
    <AuthGate cookieName="lapose_dwa" password="posJSdwa" title="Zapowiedzi">
      <AnnouncerInner />
    </AuthGate>
  )
}

function AnnouncerInner() {
  const [queueMap, setQueueMap] = useState({})
  const [nowId, setNowId] = useState(null)
  const [time, setTime] = useState(() => new Date())

  useEffect(() => subscribeQueue(setQueueMap), [])
  useEffect(() => subscribeNowId(setNowId), [])
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const order = useMemo(() => getSortedQueue(queueMap, ['pending', 'now']), [queueMap])
  const nowEntry = nowId ? queueMap?.[nowId] : null
  const nextEntry = useMemo(() => getNextAfterNow(queueMap, nowId), [queueMap, nowId])
  const clock = useMemo(
    () =>
      time.toLocaleTimeString('pl-PL', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    [time],
  )

  async function enterFullscreen() {
    if (typeof document === 'undefined') return
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.()
    }
  }

  return (
    <div className="grid gridAdmin">
      <div className="card">
        <div className="cardTitle">Teraz na scene</div>
        <div className="announceBar">
          <div className="clock">{clock}</div>
          <button className="btn btnSmall" type="button" onClick={enterFullscreen}>
            Pelny ekran
          </button>
        </div>
        {nowId && nowEntry ? (
          <div className="nowCard">
            <div className="nowTitle">TERAZ</div>
            <div className="nowLine">
              <span className="mono">{nowEntry.name}</span> —{' '}
              <span className="mono">{formatTrackLine(nowEntry)}</span>
            </div>
          </div>
        ) : (
          <div className="hint">Nikt nie zostal jeszcze wybrany.</div>
        )}

        <div className="nextCard">
          <div className="nextTitle">Nastepny po obecnym</div>
          {nextEntry ? (
            <div className="statusText">
              <span className="mono">{nextEntry.name}</span> —{' '}
              <span className="mono">{formatTrackLine(nextEntry)}</span>
            </div>
          ) : (
            <div className="hint">Brak kolejnej osoby.</div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="cardTitle">Kolejka</div>
        <div className="queue">
          {order.length === 0 ? (
            <div className="hint">Na razie pusto.</div>
          ) : (
            order.map((x, idx) => (
              <div
                key={x.id}
                className={[
                  'queueRow',
                  x.id === nowId || x.status === 'now' ? 'queueRowNow' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="queueNum">{idx + 1}</div>
                <div className="queueMain">
                  <div className="queueName">{x.name || '—'}</div>
                  <div className="queueTrack">{formatTrackLine(x)}</div>
                  <div className="queueMeta">{formatStatus(x.status)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
