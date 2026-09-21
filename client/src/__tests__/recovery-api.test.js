import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCurriculumRecovery } from '../api.js'

describe('curriculum recovery API helper', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('loads the durable onboarding state and saved draft', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ curriculumState: 'draft_ready', curriculum: { modules: [] } }),
    })
    vi.stubGlobal('fetch', fetch)

    await expect(getCurriculumRecovery(12)).resolves.toEqual({
      curriculumState: 'draft_ready',
      curriculum: { modules: [] },
    })
    expect(fetch).toHaveBeenCalledWith('http://localhost:3200/api/topics/12/curriculum/recovery')
  })
})
