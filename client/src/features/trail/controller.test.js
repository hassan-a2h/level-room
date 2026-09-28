import { describe, expect, it } from 'vitest'
import { buildTrailViewModel } from './controller.js'

describe('buildTrailViewModel', () => {
  it('normalizes dashboard modules into chapters and centers a five chapter window', () => {
    const modules = Array.from({ length: 7 }, (_, index) => ({
      id: index + 1,
      title: `Chapter ${index + 1}`,
      status: index < 3 ? 'completed' : 'available',
      lessons: [{ id: 100 + index, title: `Session ${index + 1}` }],
    }))

    const model = buildTrailViewModel({
      dashboard: { topic: { id: 2 }, modules, nextAction: { kind: 'start_session' }, weeklyRhythm: { days: [] }, focusAreas: [] },
      topics: [{ id: 1 }, { id: 2 }],
      reviewCounts: { totalDue: 4 },
      activeTopicId: 2,
      currentChapterId: 4,
      state: 'ready',
    })

    expect(model.chapters).toHaveLength(7)
    expect(model.chapters[0]).toMatchObject({ id: 1, title: 'Chapter 1', lessons: [{ id: 100 }] })
    expect(model.visibleChapters.map((chapter) => chapter.id)).toEqual([2, 3, 4, 5, 6])
    expect(model).toMatchObject({
      state: 'ready',
      topic: { id: 2 },
      topics: [{ id: 1 }, { id: 2 }],
      nextAction: { kind: 'start_session' },
      review: { totalDue: 4 },
      rhythm: { days: [] },
      focusAreas: [],
      ui: { activeTopicId: 2 },
      busy: { loading: false, switching: false },
      error: null,
    })
  })

  it('clamps the five chapter window at both ends and tolerates missing dashboard data', () => {
    const chapters = Array.from({ length: 8 }, (_, index) => ({ id: index + 1 }))
    expect(buildTrailViewModel({ dashboard: { modules: chapters }, currentChapterId: 1 }).visibleChapters.map(({ id }) => id))
      .toEqual([1, 2, 3, 4, 5])
    expect(buildTrailViewModel({ dashboard: { modules: chapters }, currentChapterId: 8 }).visibleChapters.map(({ id }) => id))
      .toEqual([4, 5, 6, 7, 8])
    expect(buildTrailViewModel({}).chapters).toEqual([])
  })
})
