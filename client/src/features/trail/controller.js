function chaptersFromDashboard(dashboard) {
  return (Array.isArray(dashboard?.modules) ? dashboard.modules : []).map((module) => ({
    ...module,
    sessions: Array.isArray(module.sessions) ? module.sessions : Array.isArray(module.lessons) ? module.lessons : [],
  }))
}

function fiveChapterWindow(chapters, currentChapterId) {
  if (chapters.length <= 5) return chapters
  let currentIndex = chapters.findIndex((chapter) => chapter.id === currentChapterId)
  if (currentIndex < 0) currentIndex = chapters.findIndex((chapter) => chapter.status !== 'completed')
  if (currentIndex < 0) currentIndex = chapters.length - 1
  const start = Math.max(0, Math.min(chapters.length - 5, currentIndex - 2))
  return chapters.slice(start, start + 5)
}

export function buildTrailViewModel({
  dashboard = null,
  topics = [],
  reviewCounts = null,
  activeTopicId = null,
  currentChapterId = null,
  state,
  loading = false,
  switching = false,
  examChapterId = null,
  error = null,
} = {}) {
  const chapters = chaptersFromDashboard(dashboard)
  const resolvedState = state || (loading ? 'loading' : dashboard ? 'ready' : topics?.length === 0 ? 'empty' : 'loading')
  const requestedChapter = chapters.find((chapter) => chapter.id === currentChapterId)
  const actionChapter = chapters.find((chapter) => chapter.id === dashboard?.nextAction?.moduleId)
  const resolvedCurrentChapterId = requestedChapter?.id ?? actionChapter?.id ?? chapters.find((chapter) => chapter.status !== 'completed')?.id ?? chapters.at(-1)?.id ?? null
  return {
    state: resolvedState,
    topic: dashboard?.topic || {},
    topics: Array.isArray(topics) ? topics : [],
    nextAction: dashboard?.nextAction || {},
    chapters,
    visibleChapters: fiveChapterWindow(chapters, resolvedCurrentChapterId),
    review: dashboard?.reviewSummary || reviewCounts || {},
    rhythm: dashboard?.weeklyRhythm || {},
    focusAreas: Array.isArray(dashboard?.focusAreas) ? dashboard.focusAreas : [],
    ui: { activeTopicId, examChapterId, currentChapterId: resolvedCurrentChapterId },
    busy: { loading, switching },
    error,
  }
}
