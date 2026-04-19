import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="page">
      <div className="card">
        <div className="cardTitle">Nie znaleziono strony</div>
        <div className="hint">Sprawdz link lub wroc na strone glowna.</div>
        <Link className="btn" to="/">
          Na strone glowna
        </Link>
      </div>
    </div>
  )
}
