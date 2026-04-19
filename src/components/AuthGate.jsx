import { useMemo, useState } from 'react'
import { deleteCookie, getCookie, setCookie } from '../lib/cookies'

export default function AuthGate({ cookieName, password, title, children }) {
  const [value, setValue] = useState('')
  const isAuthed = useMemo(() => getCookie(cookieName) === '1', [cookieName])
  const [localAuthed, setLocalAuthed] = useState(isAuthed)

  if (localAuthed) {
    return (
      <div className="page">
        <div className="topbar">
          <div className="brand">
            <div className="brandMark">LaPose</div>
            <div className="brandSub">{title}</div>
          </div>
          <button
            className="btn btnGhost"
            type="button"
            onClick={() => {
              deleteCookie(cookieName)
              setLocalAuthed(false)
            }}
          >
            Wyloguj
          </button>
        </div>
        {children}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="card">
        <div className="brandBlock">
          <div className="brandMark">LaPose</div>
          <div className="brandSub">{title}</div>
        </div>
        <div className="form">
          <label className="label" htmlFor="password">
            Haslo
          </label>
          <input
            id="password"
            className="input"
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Wpisz haslo"
            autoComplete="current-password"
          />
          <button
            className="btn"
            type="button"
            onClick={() => {
              if (value === password) {
                setCookie(cookieName, '1', { days: 30 })
                setLocalAuthed(true)
              } else {
                setValue('')
              }
            }}
          >
            Zaloguj
          </button>
          <div className="hint">Jesli haslo jest niepoprawne, pole zostanie wyczyszczone.</div>
        </div>
      </div>
    </div>
  )
}
