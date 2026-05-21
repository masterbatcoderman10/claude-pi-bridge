import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PiBridge } from '../src/bridge.js';
import type { BridgeConfig } from '../src/config.js';

const mockStart = vi.fn();
const mockPrompt = vi.fn();
const mockSteer = vi.fn();
const mockGetState = vi.fn();
const mockWaitForIdle = vi.fn();
const mockGetLastAssistantText = vi.fn();
const mockCollectEvents = vi.fn();
const mockBash = vi.fn();
const mockCompact = vi.fn();
const mockStop = vi.fn();
const mockOnEvent = vi.fn();

vi.mock('../src/vendor/pi-rpc-client.js', () => ({
  RpcClient: vi.fn().mockImplementation(() => ({
    start: mockStart,
    prompt: mockPrompt,
    steer: mockSteer,
    getState: mockGetState,
    waitForIdle: mockWaitForIdle,
    getLastAssistantText: mockGetLastAssistantText,
    collectEvents: mockCollectEvents,
    bash: mockBash,
    compact: mockCompact,
    stop: mockStop,
    onEvent: mockOnEvent,
  })),
}));

function createConfig(overrides: Partial<BridgeConfig> = {}): BridgeConfig {
  return {
    providers: {},
    defaults: {},
    limits: { maxConcurrentAgents: 2, defaultTimeoutMs: 120000 },
    ...overrides,
  };
}

describe('PiBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('spawn', () => {
    it('creates agent with correct info', async () => {
      const bridge = new PiBridge(createConfig());
      await bridge.spawn('agent1', { cwd: '/tmp' });

      const list = bridge.list();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        id: 'agent1',
        cwd: '/tmp',
        provider: 'openrouter',
        status: 'idle',
      });
      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('rejects duplicate names', async () => {
      const bridge = new PiBridge(createConfig());
      await bridge.spawn('agent1', { cwd: '/tmp' });
      await expect(bridge.spawn('agent1', { cwd: '/tmp' })).rejects.toThrow('Agent agent1 already exists');
    });

    it('respects maxConcurrentAgents limit', async () => {
      const bridge = new PiBridge(createConfig());
      await bridge.spawn('agent1', { cwd: '/tmp' });
      await bridge.spawn('agent2', { cwd: '/tmp' });
      await expect(bridge.spawn('agent3', { cwd: '/tmp' })).rejects.toThrow('Max concurrent agents (2) reached');
    });

    it('uses defaults from config', async () => {
      const bridge = new PiBridge(
        createConfig({
          defaults: { provider: 'anthropic', model: 'claude-3', thinkingLevel: 'high' },
        })
      );
      await bridge.spawn('agent1', { cwd: '/tmp' });
      const info = bridge.get('agent1')!;
      expect(info.provider).toBe('anthropic');
      expect(info.model).toBe('claude-3');
      expect(info.thinkingLevel).toBe('high');
    });

    it('sends initial prompt when provided', async () => {
      const bridge = new PiBridge(createConfig());
      await bridge.spawn('agent1', { cwd: '/tmp', initialPrompt: 'hello' });
      expect(mockPrompt).toHaveBeenCalledWith('hello');
      // After await, status is set back to idle by the event listener when agent_end fires,
      // but since we don't fire events in mock, it stays streaming (set before prompt)
      expect(bridge.get('agent1')?.status).toBe('streaming');
    });
  });

  describe('prompt', () => {
    it('calls client.prompt', async () => {
      const bridge = new PiBridge(createConfig());
      await bridge.spawn('agent1', { cwd: '/tmp' });
      await bridge.prompt('agent1', 'do work');
      expect(mockPrompt).toHaveBeenCalledWith('do work');
      expect(bridge.get('agent1')?.status).toBe('streaming');
    });

    it('throws for unknown agent', async () => {
      const bridge = new PiBridge(createConfig());
      await expect(bridge.prompt('missing', 'hello')).rejects.toThrow('Agent missing not found');
    });
  });

  describe('getResult', () => {
    it('calls client.waitForIdle + getLastAssistantText', async () => {
      mockGetLastAssistantText.mockResolvedValue('result text');
      const bridge = new PiBridge(createConfig());
      await bridge.spawn('agent1', { cwd: '/tmp' });
      const result = await bridge.getResult('agent1');
      expect(mockWaitForIdle).toHaveBeenCalledWith(120000);
      expect(mockGetLastAssistantText).toHaveBeenCalled();
      expect(result).toBe('result text');
    });

    it('returns empty string when no assistant text', async () => {
      mockGetLastAssistantText.mockResolvedValue(null);
      const bridge = new PiBridge(createConfig());
      await bridge.spawn('agent1', { cwd: '/tmp' });
      const result = await bridge.getResult('agent1');
      expect(result).toBe('');
    });
  });

  describe('list', () => {
    it('returns all agents', async () => {
      const bridge = new PiBridge(createConfig());
      await bridge.spawn('a1', { cwd: '/tmp' });
      await bridge.spawn('a2', { cwd: '/home' });
      const list = bridge.list();
      expect(list).toHaveLength(2);
      expect(list.map((a) => a.id)).toEqual(['a1', 'a2']);
    });

    it('returns empty array when no agents', () => {
      const bridge = new PiBridge(createConfig());
      expect(bridge.list()).toEqual([]);
    });
  });

  describe('get', () => {
    it('returns agent info', async () => {
      const bridge = new PiBridge(createConfig());
      await bridge.spawn('agent1', { cwd: '/tmp' });
      expect(bridge.get('agent1')?.id).toBe('agent1');
    });

    it('returns undefined for unknown agent', () => {
      const bridge = new PiBridge(createConfig());
      expect(bridge.get('missing')).toBeUndefined();
    });
  });

  describe('stop', () => {
    it('removes agent and calls client.stop', async () => {
      const bridge = new PiBridge(createConfig());
      await bridge.spawn('agent1', { cwd: '/tmp' });
      await bridge.stop('agent1');
      expect(mockStop).toHaveBeenCalledTimes(1);
      expect(bridge.get('agent1')).toBeUndefined();
    });

    it('does nothing for unknown agent', async () => {
      const bridge = new PiBridge(createConfig());
      await bridge.stop('missing');
      expect(mockStop).not.toHaveBeenCalled();
    });
  });

  describe('stopAll', () => {
    it('stops all agents', async () => {
      const bridge = new PiBridge(createConfig());
      await bridge.spawn('a1', { cwd: '/tmp' });
      await bridge.spawn('a2', { cwd: '/tmp' });
      await bridge.stopAll();
      expect(mockStop).toHaveBeenCalledTimes(2);
      expect(bridge.list()).toEqual([]);
    });
  });

  describe('steer', () => {
    it('calls client.steer', async () => {
      const bridge = new PiBridge(createConfig());
      await bridge.spawn('agent1', { cwd: '/tmp' });
      await bridge.steer('agent1', 'stop');
      expect(mockSteer).toHaveBeenCalledWith('stop');
    });
  });

  describe('bash', () => {
    it('calls client.bash', async () => {
      mockBash.mockResolvedValue({ stdout: 'hi' });
      const bridge = new PiBridge(createConfig());
      await bridge.spawn('agent1', { cwd: '/tmp' });
      const result = await bridge.bash('agent1', 'echo hi');
      expect(mockBash).toHaveBeenCalledWith('echo hi');
      expect(result).toEqual({ stdout: 'hi' });
    });
  });

  describe('compact', () => {
    it('calls client.compact', async () => {
      mockCompact.mockResolvedValue({ ok: true });
      const bridge = new PiBridge(createConfig());
      await bridge.spawn('agent1', { cwd: '/tmp' });
      const result = await bridge.compact('agent1', 'custom');
      expect(mockCompact).toHaveBeenCalledWith('custom');
      expect(result).toEqual({ ok: true });
    });
  });
});
