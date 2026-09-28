import { toPublicError } from '../../lib/publicError.js'

const titles = Object.freeze({
  offline: 'Learning service unavailable',
  validation: 'Check your information',
  access: 'This action is unavailable',
  expired: 'This learning session has expired',
  server: 'Learning service needs a moment',
  unknown: 'We hit a snag',
})

export default function SupportSurface({ model = {}, actions = {} }) {
  const safeError = toPublicError({ message: model.message, retryable: model.retryable }, 'Please try again or return to your Trail.')
  const kind = Object.hasOwn(titles, model.kind) ? model.kind : safeError.kind
  const returnLabel = model.returnLabel === 'Go to Settings' ? 'Go to Settings' : 'Return to your Trail'

  return (
    <div className="ui-page px-4 py-8 sm:px-6">
      <section className="ui-container ui-panel mx-auto max-w-2xl p-6 sm:p-8" aria-labelledby="support-title">
        <div className="ui-alert ui-alert-danger mb-5" role="alert">
          <h1 id="support-title" className="text-2xl font-semibold ui-text">{titles[kind]}</h1>
          <p className="mt-2 ui-text-secondary">{safeError.message}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {safeError.retryable && typeof actions.retry === 'function' && (
            <button type="button" className="ui-button ui-button-primary" onClick={actions.retry}>Try again</button>
          )}
          <a className="ui-button ui-button-secondary" href={returnLabel === 'Go to Settings' ? '/settings' : '/'}>{returnLabel}</a>
        </div>
      </section>
    </div>
  )
}
