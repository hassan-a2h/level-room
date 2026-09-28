const FULL_DAYS = {
  Sun: 'Sunday',
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
}

function activityLabel(day) {
  const activities = []
  if (day.sessions > 0) activities.push(`${day.sessions} Session${day.sessions === 1 ? '' : 's'}`)
  if (day.checkpoints > 0) activities.push(`${day.checkpoints} checkpoint${day.checkpoints === 1 ? '' : 's'}`)
  if (day.reviews > 0) activities.push(`${day.reviews} review${day.reviews === 1 ? '' : 's'}`)
  return activities.length ? activities.join(', ') : 'Rest day'
}

export default function WeeklyRhythm({ rhythm }) {
  const days = Array.isArray(rhythm?.days) ? rhythm.days.slice(-7) : []

  return (
    <section className="ui-surface ui-surface-raised p-4 sm:p-5" aria-label="Weekly rhythm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold ui-text">Weekly rhythm</h2>
        <span className="text-xs ui-text-muted">{rhythm?.activeDays || 0} active {rhythm?.activeDays === 1 ? 'day' : 'days'}</span>
      </div>
      <ul className="mt-4 grid grid-cols-7 gap-1.5" aria-label="Learning activity over the last seven days">
        {days.map((day) => {
          const fullName = FULL_DAYS[day.label] || day.label || day.date
          const activity = activityLabel(day)
          return (
            <li key={day.date} className="text-center">
              <span className="block text-[0.7rem] ui-text-muted" aria-hidden="true">{day.label}</span>
              <span
                className={`trail-rhythm-dot mx-auto mt-2 block h-3 w-3 rounded-full border${day.active ? ' is-active' : ''}`}
                aria-hidden="true"
              />
              <span className="sr-only">{fullName}: {activity}</span>
            </li>
          )
        })}
      </ul>
      {days.length === 0 && <p className="mt-3 text-sm ui-text-muted">Your learning days will show up here.</p>}
    </section>
  )
}
