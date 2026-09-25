import { AppShellHeader } from './layout/AppShell.jsx'
import FocusShell from './layout/FocusShell.jsx'

export default function AppHeader({
  variant = 'standard',
  dueCount,
  title,
  returnTo = '/',
  returnLabel = 'Dashboard',
  detail,
  progress,
  onReturn,
}) {
  if (variant === 'focus') {
    return (
      <FocusShell
        title={title}
        detail={detail}
        progress={progress}
        returnTo={returnTo}
        returnLabel={returnLabel}
        onReturn={onReturn}
      />
    )
  }

  return <AppShellHeader dueCount={dueCount} />
}
