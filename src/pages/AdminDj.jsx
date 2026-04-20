import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import AuthGate from '../components/AuthGate'
import {
  clearQueue,
  formatStatus,
  formatTrackLine,
  getNextAfterNow,
  getQueueStats,
  getRecentHistory,
  getSortedQueue,
  markDone,
  markNoTrack,
  markSkipped,
  pickNextPending,
  returnToPending,
  setCurrentEntry,
  subscribeNowId,
  subscribeQueue,
} from '../lib/queue'

export default function AdminDj() {
  return (
    <AuthGate cookieName="lapose_admin" password="posJSadmin" title="Panel DJ">
      <AdminInner />
    </AuthGate>
  )
}

function AdminInner() {
  const [queueMap, setQueueMap] = useState({})
  const [nowId, setNowId] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('active')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [lastCopied, setLastCopied] = useState(null)
  const [copyVisibleCount, setCopyVisibleCount] = useState(5)
  const [copyLoadingMore, setCopyLoadingMore] = useState(false)
  const copyListRef = useRef(null)
  const copyMoreRef = useRef(null)

  useEffect(() => subscribeQueue(setQueueMap), [])
  useEffect(() => subscribeNowId(setNowId), [])

  const activeOrder = useMemo(() => getSortedQueue(queueMap, ['pending', 'now']), [queueMap])
  const history = useMemo(() => getRecentHistory(queueMap, 40), [queueMap])
  const stats = useMemo(() => getQueueStats(queueMap), [queueMap])
  const lowerQuery = query.trim().toLowerCase()
  const order = useMemo(() => {
    const source = mode === 'history' ? history : activeOrder
    if (!lowerQuery) return source
    return source.filter((x) =>
      `${x?.name || ''} ${x?.track || ''}`.toLowerCase().includes(lowerQuery),
    )
  }, [mode, history, activeOrder, lowerQuery])
  const effectiveSelectedId = selectedId || nowId
  const selected = effectiveSelectedId ? queueMap?.[effectiveSelectedId] : null
  const nextAfterCurrent = useMemo(() => getNextAfterNow(queueMap, nowId), [queueMap, nowId])
  const announcerLineNow = useMemo(() => {
    if (!selected) return 'Brak wybranej osoby.'
    return `Teraz zapraszamy: ${selected.name || 'Gosc'} - ${formatTrackLine(selected)}.`
  }, [selected])
  const announcerLineNext = useMemo(() => {
    if (!nextAfterCurrent) return 'Brak kolejnej osoby.'
    return `Nastepny w kolejnosci: ${nextAfterCurrent.name || 'Gosc'} - ${formatTrackLine(nextAfterCurrent)}.`
  }, [nextAfterCurrent])

  async function selectEntry(id) {
    setError('')
    setSelectedId(id)
    setBusy(true)
    try {
      await setCurrentEntry(id)
    } catch {
      setError('Nie udalo sie zaktualizowac statusu. Sprawdz internet.')
    } finally {
      setBusy(false)
    }
  }

  async function copyText(text, meta) {
    if (!text) return
    const label = meta?.field === 'name' ? 'Skopiowano: imie' : meta?.field === 'track' ? 'Skopiowano: utwor' : 'Skopiowano'
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setLastCopied(meta || null)
      setTimeout(() => setCopied(''), 900)
    } catch {
      try {
        const el = document.createElement('textarea')
        el.value = text
        el.setAttribute('readonly', 'true')
        el.style.position = 'fixed'
        el.style.left = '-9999px'
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
        setCopied(label)
        setLastCopied(meta || null)
        setTimeout(() => setCopied(''), 900)
      } catch {
        setCopied('Nie udalo sie skopiowac')
        setLastCopied(null)
        setTimeout(() => setCopied(''), 1200)
      }
    }
  }

  async function done() {
    if (!effectiveSelectedId) return
    setBusy(true)
    setError('')
    try {
      await markDone(effectiveSelectedId)
      setSelectedId(null)
    } catch {
      setError('Nie udalo sie oznaczyc jako wykonane.')
    } finally {
      setBusy(false)
    }
  }

  async function noTrack() {
    if (!effectiveSelectedId) return
    setBusy(true)
    setError('')
    try {
      await markNoTrack(effectiveSelectedId)
      setSelectedId(null)
    } catch {
      setError('Nie udalo sie oznaczyc braku utworu.')
    } finally {
      setBusy(false)
    }
  }

  async function skip() {
    if (!effectiveSelectedId) return
    setBusy(true)
    setError('')
    try {
      await markSkipped(effectiveSelectedId)
      setSelectedId(null)
    } catch {
      setError('Nie udalo sie pominac uczestnika.')
    } finally {
      setBusy(false)
    }
  }

  async function backToQueue() {
    if (!effectiveSelectedId) return
    setBusy(true)
    setError('')
    try {
      await returnToPending(effectiveSelectedId)
      setSelectedId(null)
    } catch {
      setError('Nie udalo sie przywrocic uczestnika do kolejki.')
    } finally {
      setBusy(false)
    }
  }

  async function nextUp() {
    setBusy(true)
    setError('')
    try {
      await pickNextPending(queueMap)
    } catch {
      setError('Nie udalo sie wybrac nastepnej osoby.')
    } finally {
      setBusy(false)
    }
  }

  async function resetQueue() {
    const ok = typeof window !== 'undefined' ? window.confirm('Wyczyscic cala kolejke?') : false
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      await clearQueue()
      setSelectedId(null)
    } catch {
      setError('Nie udalo sie wyczyscic kolejki.')
    } finally {
      setBusy(false)
    }
  }

  const copyDisplayed = useMemo(
    () => activeOrder.slice(0, Math.min(copyVisibleCount, activeOrder.length)),
    [activeOrder, copyVisibleCount],
  )
  const copyHasMore = copyVisibleCount < activeOrder.length

  useEffect(() => {
    if (!copyHasMore || !copyListRef.current || !copyMoreRef.current) return
    const root = copyListRef.current
    const target = copyMoreRef.current
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting) {
          setCopyLoadingMore(true)
          setCopyVisibleCount((prev) => Math.min(prev + 5, activeOrder.length))
          setTimeout(() => setCopyLoadingMore(false), 180)
        }
      },
      { root, threshold: 0.2 },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [copyHasMore, activeOrder.length])

  return (
    <div className="grid gridAdmin">
      <div className="card">
        <div className="cardTitle">Kolejka</div>
        <div className="toolbar">
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj po imieniu lub utworze"
            inputMode="text"
          />
          <div className="modeRow">
            <button
              className={`btn btnSmall ${mode === 'active' ? 'btnActive' : ''}`}
              type="button"
              onClick={() => setMode('active')}
            >
              Aktywne
            </button>
            <button
              className={`btn btnSmall ${mode === 'history' ? 'btnActive' : ''}`}
              type="button"
              onClick={() => setMode('history')}
            >
              Historia
            </button>
          </div>
        </div>
        <div className="statsGrid">
          <div className="statChip">Aktywne: {(stats.pending || 0) + (stats.now || 0)}</div>
          <div className="statChip">Teraz: {stats.now || 0}</div>
          <div className="statChip">Wykonane: {stats.done || 0}</div>
          <div className="statChip">Brak utworu: {stats.no_track || 0}</div>
        </div>
        <div className="hint">
          Kliknij osobe, aby ustawic ja jako "TERAZ". W historii widzisz statusy zakonczonych zgloszen.
        </div>
        <div className="queue">
          {order.length === 0 ? (
            <div className="hint">Na razie pusto.</div>
          ) : (
            order.map((x, idx) => (
              <button
                key={x.id}
                type="button"
                className={[
                  'queueRow',
                  x.status === 'now' || x.id === nowId ? 'queueRowNow' : '',
                  x.id === effectiveSelectedId ? 'queueRowSelected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => selectEntry(x.id)}
                disabled={busy}
              >
                <div className="queueNum">{idx + 1}</div>
                <div className="queueMain">
                  <div className="queueName">{x.name || '—'}</div>
                  <div className="queueTrack">{formatTrackLine(x)}</div>
                  <div className="queueMeta">{formatStatus(x.status)}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <div className="cardTitle">Akcje DJ</div>

        {effectiveSelectedId && selected ? (
          <div className="status">
            <div className="statusTitle">{nowId === effectiveSelectedId ? 'TERAZ' : 'Wybrano'}</div>
            <div className="statusText">
              Imie: <span className="mono">{selected.name}</span>
            </div>
            <div className="statusText">
              Utwor: <span className="mono">{formatTrackLine(selected)}</span>
            </div>

            <div className="actions">
              <button className="btn" type="button" onClick={nextUp} disabled={busy}>
                Nastepny
              </button>
              <button className="btn" type="button" onClick={done} disabled={busy}>
                Wykonane
              </button>
              <button className="btn btnDanger" type="button" onClick={noTrack} disabled={busy}>
                Brak utworu
              </button>
              <button className="btn" type="button" onClick={skip} disabled={busy}>
                Pomin
              </button>
              <button className="btn btnGhost" type="button" onClick={backToQueue} disabled={busy}>
                Przywroc do kolejki
              </button>
            </div>
            <div className="hint">
              Status "TERAZ" bedzie podswietlony na ekranie zapowiedzi i u uczestnika.
            </div>
          </div>
        ) : (
          <div className="status">
            <div className="hint">Wybierz osobe z listy po lewej.</div>
            <div className="actions">
              <button className="btn" type="button" onClick={nextUp} disabled={busy}>
                Ustaw nastepna osobe
              </button>
              <button className="btn btnDanger" type="button" onClick={resetQueue} disabled={busy}>
                Wyczysc kolejke
              </button>
            </div>
          </div>
        )}

        {error ? <div className="error">{error}</div> : null}

        <div className="copyPanel">
          <div className="cardTitle">Kopiowanie</div>
          <div className="hint">Kliknij, aby skopiowac. Ostatnio skopiowane podswietla sie na zielono.</div>
          <div className="copyList" ref={copyListRef}>
            {activeOrder.length === 0 ? (
              <div className="hint">Brak aktywnych.</div>
            ) : (
              copyDisplayed.map((x, idx) => (
                <div key={x.id} className="copyRow">
                  <div className="copyNum">{idx + 1}</div>
                  <div className="copyBody">
                    <div className="copyLine">
                      <div className="copyText">{x.name || '—'}</div>
                      <button
                        className={[
                          'copyBtn',
                          lastCopied?.id === x.id && lastCopied?.field === 'name' ? 'copyBtnActive' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        type="button"
                        onClick={() => copyText(x.name || '', { id: x.id, field: 'name' })}
                      >
                        Imie
                      </button>
                    </div>
                    <div className="copyLine">
                      <div className="copyText copyMuted">{formatTrackLine(x)}</div>
                      <button
                        className={[
                          'copyBtn',
                          lastCopied?.id === x.id && lastCopied?.field === 'track' ? 'copyBtnActive' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        type="button"
                        onClick={() => copyText(formatTrackLine(x), { id: x.id, field: 'track' })}
                      >
                        Utwor
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={copyMoreRef} className="copySentinel"></div>
          </div>
          {copyHasMore || copyLoadingMore ? (
            <div className="hint">{copyLoadingMore ? 'Laduje wiecej...' : 'Przewin w dol, aby zaladowac wiecej.'}</div>
          ) : null}
        </div>

        <div className="announceHelper">
          <div className="cardTitle">Panel Zapowiadajacego</div>
          <div className="statusText">{announcerLineNow}</div>
          <div className="statusText">{announcerLineNext}</div>
          <div className="hint">
            Otworz ekran zapowiedzi:
            <Link className="linkInline" to="/dwaczelJG">
              /dwaczelJG
            </Link>
          </div>
          <div className="hint">Haslo zapowiedzi: posJSdwa</div>
        </div>
      </div>

      <div className={['toast', copied ? 'toastShow' : ''].filter(Boolean).join(' ')}>{copied}</div>
    </div>
  )
}
