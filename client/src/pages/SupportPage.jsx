import { useLocation } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import { toPublicError } from '../lib/publicError.js'
import { useThemeView } from '../theme/ThemeProvider.jsx'

export default function SupportPage() {
  const SupportView = useThemeView('SupportView')
  const location = useLocation()
  const routeState = location.state && typeof location.state === 'object' ? location.state : {}
  const params = new URLSearchParams(location.search)
  const error = toPublicError(routeState.error || { message: routeState.message || params.get('message'), status: routeState.status }, 'We could not complete that request. Please try again or return to your Trail.')
  const routeKind = routeState.kind || params.get('kind')
  const kind = ['offline', 'validation', 'access', 'expired', 'server'].includes(routeKind) ? routeKind : error.kind
  const model = {
    kind,
    title: '',
    message: error.message,
    detail: null,
    retryable: error.retryable,
    returnLabel: routeState.returnLabel === 'Go to Settings' ? 'Go to Settings' : 'Return to your Trail',
  }

  return <><AppHeader /><SupportView model={model} actions={{ retry: () => window.location.reload() }} /></>
}
