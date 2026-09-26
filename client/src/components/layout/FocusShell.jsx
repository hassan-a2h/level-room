import { Link } from 'react-router-dom'

function safeReturnPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\') || /[\u0000-\u001F]/.test(path)) {
    return '/'
  }
  return path
}

export default function FocusShell({ title, detail, progress, returnTo = '/', returnLabel = 'Dashboard', onReturn }) {
  const safePath = safeReturnPath(returnTo)
  return (
    <header className="focus-shell-header ui-app-header">
      <div className="focus-shell-inner ui-header-inner">
        {onReturn ? (
          <button className="focus-shell-back ui-header-back" type="button" onClick={onReturn} aria-label={`Back to ${returnLabel}`}>
            <span aria-hidden="true">←</span> Back to {returnLabel}
          </button>
        ) : (
          <Link className="focus-shell-back ui-header-back" to={safePath} aria-label={`Back to ${returnLabel}`}>
            <span aria-hidden="true">←</span> Back to {returnLabel}
          </Link>
        )}
        <div className="focus-shell-context">
          <h1>{title}</h1>
          {detail && <p>{detail}</p>}
        </div>
        {progress && <p className="focus-shell-progress"><span className="sr-only">Progress: </span>{progress}</p>}
      </div>
    </header>
  )
}
