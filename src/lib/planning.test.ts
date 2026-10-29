import { describe, expect, it } from 'vitest'
import { defaultAvailability } from './availability'
import { buildDays, buildTasks, replacedBlock, type PlanInputs } from './planning'
import type { Assignment, Subject, WorkBlock } from './types'

const now = new Date(2026, 10, 2, 9) // lundi 2 novembre, 9 h
const base = { space_id: 's', user_id: 'u', created_at: '', updated_at: '', deleted_at: null }
const assignment = (id: string, due: string, est: number | null, status: Assignment['status'] = 'todo') =>
  ({ ...base, id, subject_id: 'fin', title: id, description: '', due_at: due, estimated_minutes: est, status, done_at: null }) as Assignment
const block = (p: Partial<WorkBlock>) => ({ ...base, id: Math.random().toString(), assignment_id: null, day: '2026-11-02', minutes: 30, done: false, ...p }) as WorkBlock

const inputs = (over: Partial<PlanInputs> = {}): PlanInputs => ({
  assignments: [assignment('dossier', '2026-11-05T23:59:00', 180), assignment('fini', '2026-11-04T12:00:00', 60, 'done')],
  subjects: [{ ...base, id: 'fin', name: 'Finance', color: '#000000', keywords: [], exam_date: '2026-11-10', position: 0, revision_minutes: 240 } as Subject],
  blocks: [block({ assignment_id: 'dossier', done: true, minutes: 60, day: '2026-11-01' }), block({ assignment_id: 'dossier', day: '2026-10-31' })],
  classes: [],
  availability: defaultAvailability(120),
  now,
  overrides: {},
  excluded: new Set(),
  ...over,
})

describe('données du planificateur', () => {
  it('reprend les devoirs non faits et les révisions d’examen', () => {
    const tasks = buildTasks(inputs())
    expect(tasks.map((t) => [t.id, t.minutes, t.lastDay, t.missed])).toEqual([
      ['a:dossier', 120, '2026-11-04', 1],
      ['r:fin', 240, '2026-11-09', 0],
    ])
  })
  it('tient compte d’une estimation modifiée et des tâches retirées', () => {
    const tasks = buildTasks(inputs({ overrides: { 'a:dossier': 90 }, excluded: new Set(['r:fin']) }))
    expect(tasks[0].minutes).toBe(30)
    expect(tasks[1].included).toBe(false)
  })
  it('remplace les séances non faites des tâches planifiées, pas les autres', () => {
    const p = inputs()
    const tasks = buildTasks(p)
    expect(replacedBlock(p.blocks[1], tasks)).toBe(true)
    expect(replacedBlock(p.blocks[0], tasks)).toBe(false)
  })
  it('prépare les jours jusqu’à la dernière échéance', () => {
    const p = inputs()
    const days = buildDays(p, buildTasks(p))
    expect(days[0].day).toBe('2026-11-02')
    expect(days.at(-1)!.day).toBe('2026-11-09')
    expect(days[5].target).toBe(180) // samedi
  })
})
