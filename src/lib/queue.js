import { get, onValue, push, ref, runTransaction, serverTimestamp, set, update } from 'firebase/database'
import { db } from '../firebase'

export function subscribeQueue(callback) {
  const queueRef = ref(db, 'queue')
  return onValue(queueRef, (snap) => {
    callback(snap.val() || {})
  })
}

export function subscribeNowId(callback) {
  const nowRef = ref(db, 'state/nowId')
  return onValue(nowRef, (snap) => {
    callback(snap.val() || null)
  })
}

function withUpdatedServerTime(patch) {
  return {
    ...patch,
    updatedAt: Date.now(),
    updatedAtServer: serverTimestamp(),
  }
}

export async function createQueueEntry({
  clientId,
  name,
  track,
  trackId = null,
  trackTitle = null,
  trackArtist = null,
  trackYear = null,
  trackStyle = null,
  trackLanguage = null,
}) {
  const queueRef = ref(db, 'queue')
  const entryRef = push(queueRef)
  const payload = {
    clientId,
    name,
    track,
    trackId,
    trackTitle,
    trackArtist,
    trackYear,
    trackStyle,
    trackLanguage,
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdAtServer: serverTimestamp(),
    updatedAtServer: serverTimestamp(),
  }
  await set(entryRef, payload)
  return entryRef.key
}

export function subscribeEntry(entryId, callback) {
  if (!entryId) return () => {}
  const entryRef = ref(db, `queue/${entryId}`)
  return onValue(entryRef, (snap) => {
    callback(snap.exists() ? snap.val() : null)
  })
}

export async function setCurrentEntry(entryId) {
  const nowRef = ref(db, 'state/nowId')
  const prevSnap = await get(nowRef)
  const prevId = prevSnap.val() || null
  await runTransaction(nowRef, () => entryId || null)

  if (prevId && prevId !== entryId) {
    await update(ref(db, `queue/${prevId}`), withUpdatedServerTime({
      status: 'pending',
    }))
  }
  if (entryId) {
    await update(ref(db, `queue/${entryId}`), withUpdatedServerTime({
      status: 'now',
      calledAt: Date.now(),
    }))
  }
}

export async function markDone(entryId) {
  if (!entryId) return
  await update(ref(db, `queue/${entryId}`), withUpdatedServerTime({
    status: 'done',
    doneAt: Date.now(),
  }))
  await set(ref(db, 'state/nowId'), null)
}

export async function markNoTrack(entryId) {
  if (!entryId) return
  await update(ref(db, `queue/${entryId}`), withUpdatedServerTime({
    status: 'no_track',
    noTrackAt: Date.now(),
  }))
  await set(ref(db, 'state/nowId'), null)
}

export async function markSkipped(entryId) {
  if (!entryId) return
  await update(ref(db, `queue/${entryId}`), withUpdatedServerTime({
    status: 'skipped',
    skippedAt: Date.now(),
  }))
  await set(ref(db, 'state/nowId'), null)
}

export async function cancelEntry(entryId) {
  if (!entryId) return
  const nowSnap = await get(ref(db, 'state/nowId'))
  if (nowSnap.val() === entryId) {
    await set(ref(db, 'state/nowId'), null)
  }
  await update(ref(db, `queue/${entryId}`), withUpdatedServerTime({
    status: 'cancelled',
    cancelledAt: Date.now(),
  }))
}

export async function returnToPending(entryId) {
  if (!entryId) return
  const nowSnap = await get(ref(db, 'state/nowId'))
  if (nowSnap.val() === entryId) {
    await set(ref(db, 'state/nowId'), null)
  }
  await update(ref(db, `queue/${entryId}`), withUpdatedServerTime({
    status: 'pending',
  }))
}

export async function pickNextPending(queueMap) {
  const list = Object.entries(queueMap || {})
    .map(([id, value]) => ({ id, ...value }))
    .filter((x) => x && x.status === 'pending')
    .sort((a, b) => {
      const ta = typeof a.createdAt === 'number' ? a.createdAt : 0
      const tb = typeof b.createdAt === 'number' ? b.createdAt : 0
      if (ta !== tb) return ta - tb
      return a.id.localeCompare(b.id)
    })

  if (!list.length) return null
  await setCurrentEntry(list[0].id)
  return list[0].id
}

export function getQueueStats(queueMap) {
  const values = Object.values(queueMap || {})
  return values.reduce(
    (acc, item) => {
      const status = item?.status || 'unknown'
      acc.total += 1
      acc[status] = (acc[status] || 0) + 1
      return acc
    },
    { total: 0 },
  )
}

export function getSortedQueue(queueMap, allowedStatuses) {
  const list = Object.entries(queueMap || {}).map(([id, value]) => ({ id, ...value }))
  return list
    .filter((x) => (allowedStatuses?.length ? allowedStatuses.includes(x?.status) : true))
    .sort((a, b) => {
      const ta = typeof a.createdAt === 'number' ? a.createdAt : 0
      const tb = typeof b.createdAt === 'number' ? b.createdAt : 0
      if (ta !== tb) return ta - tb
      return a.id.localeCompare(b.id)
    })
}

export function getRecentHistory(queueMap, limit = 30) {
  return getSortedQueue(queueMap, ['done', 'no_track', 'skipped', 'cancelled'])
    .sort((a, b) => {
      const ta = typeof a.updatedAt === 'number' ? a.updatedAt : 0
      const tb = typeof b.updatedAt === 'number' ? b.updatedAt : 0
      return tb - ta
    })
    .slice(0, limit)
}

export function formatStatus(status) {
  const map = {
    pending: 'W kolejce',
    now: 'Teraz',
    done: 'Wykonane',
    no_track: 'Brak utworu',
    skipped: 'Pominieto',
    cancelled: 'Anulowano',
  }
  return map[status] || 'Nieznany'
}

export function computeEtaMinutes(position, minutesPerTrack = 4) {
  if (!position || position <= 1) return 0
  return (position - 1) * minutesPerTrack
}

export function formatEta(minutes) {
  if (minutes <= 0) return 'Wkrotce'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0) return `${h} godz ${m} min`
  return `${m} min`
}

export function getNextAfterNow(queueMap, nowId) {
  const active = getSortedQueue(queueMap, ['pending', 'now'])
  if (!active.length) return null
  const currentIndex = active.findIndex((x) => x.id === nowId)
  if (currentIndex < 0) return active[0]
  return active[currentIndex + 1] || null
}

export function getTopPending(queueMap, limit = 5) {
  return getSortedQueue(queueMap, ['pending']).slice(0, limit)
}

export function formatTrackLine(entry) {
  if (!entry) return '—'
  if (entry.trackArtist && entry.trackTitle) {
    const meta = [entry.trackYear, entry.trackStyle].filter(Boolean).join(', ')
    return meta
      ? `${entry.trackArtist} - ${entry.trackTitle} (${meta})`
      : `${entry.trackArtist} - ${entry.trackTitle}`
  }
  return entry.track || '—'
}

export async function clearQueue() {
  await set(ref(db, 'queue'), null)
  await set(ref(db, 'state/nowId'), null)
}
