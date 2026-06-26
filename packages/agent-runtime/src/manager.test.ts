import { describe, it, expect } from 'vitest'
import { AgentManager } from './manager.js'

describe('AgentManager', () => {
  it('creates an agent and rejects a duplicate id', () => {
    const m = new AgentManager()
    expect(m.createAgent('a')).not.toBeNull()
    expect(m.createAgent('a')).toBeNull() // duplicate id
  })

  it('lists and removes agents', () => {
    const m = new AgentManager()
    m.createAgent('a')
    m.createAgent('b')
    expect(m.listAgents().map(([id]) => id).sort()).toEqual(['a', 'b'])
    expect(m.removeAgent('a')).toBe(true)
    expect(m.getAgent('a')).toBeUndefined()
    expect(m.listAgents()).toHaveLength(1)
  })

  it('removing an unknown agent returns false', () => {
    const m = new AgentManager()
    expect(m.removeAgent('nope')).toBe(false)
  })

  it('shares one bus, state, and workflow engine across the manager', () => {
    const m = new AgentManager()
    m.state.set('k', 'v', 'tester')
    expect(m.state.get('k')?.value).toBe('v')
    m.bus.broadcast('a', 'msg', 'hi')
    expect(m.bus.getFor('a')).toHaveLength(1)
  })

  it('setRpc returns false for an unknown agent', () => {
    const m = new AgentManager()
    expect(m.setRpc('nope', 'https://api.devnet.solana.com')).toBe(false)
  })
})
