import { describe, it, expect } from 'vitest'
import { WorkflowEngine } from './workflow.js'
import type { Workflow, WorkflowStep } from './types.js'

const step = (id: string, dependencies: string[] = []): WorkflowStep => ({
  id,
  name: id,
  description: '',
  status: 'Pending',
  assigned_to: null,
  dependencies,
  result: null,
  started_at: null,
  completed_at: null,
  timeout_secs: null,
})

const workflow = (steps: WorkflowStep[], over: Partial<Workflow> = {}): Workflow => ({
  id: 'wf1',
  name: 'wf',
  description: '',
  status: 'running',
  steps,
  current_step: 0,
  created_at: '',
  updated_at: '',
  created_by: 'tester',
  assigned_agents: ['alice'],
  priority: 5,
  tags: [],
  ...over,
})

describe('WorkflowEngine', () => {
  it('get/list return deep copies — external mutation cannot corrupt internal state', () => {
    const eng = new WorkflowEngine()
    eng.create(workflow([step('a')]))
    const copy = eng.get('wf1')!
    copy.steps[0].status = 'Completed' // mutate the copy
    expect(eng.get('wf1')!.steps[0].status).toBe('Pending') // internal unchanged
  })

  it('completing every step flips the workflow to "completed"', () => {
    const eng = new WorkflowEngine()
    eng.create(workflow([step('a'), step('b', ['a'])]))

    eng.completeStep('wf1', 'a', 'done-a')
    expect(eng.get('wf1')!.status).toBe('running') // still one pending
    expect(eng.getActive()).toHaveLength(1)

    eng.completeStep('wf1', 'b', 'done-b')
    expect(eng.get('wf1')!.status).toBe('completed')
    expect(eng.getActive()).toHaveLength(0)
    expect(eng.get('wf1')!.steps.find((s) => s.id === 'a')!.result).toBe('done-a')
  })

  it('startStep marks InProgress + a started_at timestamp', () => {
    const eng = new WorkflowEngine()
    eng.create(workflow([step('a')]))
    eng.startStep('wf1', 'a')
    const s = eng.get('wf1')!.steps[0]
    expect(s.status).toBe('InProgress')
    expect(s.started_at).not.toBeNull()
  })

  it('failStep records the failure reason on the step', () => {
    const eng = new WorkflowEngine()
    eng.create(workflow([step('a')]))
    eng.failStep('wf1', 'a', 'rpc down')
    const s = eng.get('wf1')!.steps[0]
    expect(s.status).toBe('Failed')
    expect(s.result).toContain('rpc down')
  })

  it('getForAgent returns only workflows the agent participates in', () => {
    const eng = new WorkflowEngine()
    eng.create(workflow([step('a')], { id: 'mine', assigned_agents: ['alice'] }))
    eng.create(workflow([step('a')], { id: 'theirs', assigned_agents: ['bob'] }))
    const mine = eng.getForAgent('alice')
    expect(mine.map((w) => w.id)).toEqual(['mine'])
  })

  it('unknown workflow/step ids return false, never throw', () => {
    const eng = new WorkflowEngine()
    expect(eng.completeStep('nope', 'a', '')).toBe(false)
    expect(eng.startStep('nope', 'a')).toBe(false)
  })
})
