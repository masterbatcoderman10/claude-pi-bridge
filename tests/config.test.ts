import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { loadConfig, resolveAuthEnv, getConfigPath } from '../src/config.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

describe('config', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getConfigPath', () => {
    it('returns path in home directory', () => {
      expect(getConfigPath()).toBe('/home/testuser/.claude-pi-bridge/config.json');
    });
  });

  describe('loadConfig', () => {
    it('returns defaults when file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const config = loadConfig();
      expect(config).toEqual({
        providers: {},
        defaults: {},
        limits: {
          maxConcurrentAgents: 5,
          defaultTimeoutMs: 120000,
        },
      });
    });

    it('merges user config with defaults', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          defaults: { provider: 'openai' },
          limits: { maxConcurrentAgents: 10 },
        })
      );
      const config = loadConfig();
      expect(config.defaults.provider).toBe('openai');
      expect(config.limits.maxConcurrentAgents).toBe(10);
      // shallow merge means limits is fully replaced, so defaultTimeoutMs is lost
      expect(config.limits.defaultTimeoutMs).toBeUndefined();
      expect(config.providers).toEqual({});
    });

    it('returns defaults on parse error', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('not json');
      const config = loadConfig();
      expect(config.limits.maxConcurrentAgents).toBe(5);
    });
  });

  describe('resolveAuthEnv', () => {
    it('returns empty when provider not in config', () => {
      const config = { providers: {}, defaults: {}, limits: { maxConcurrentAgents: 5, defaultTimeoutMs: 120000 } };
      expect(resolveAuthEnv('unknown', config)).toEqual({});
    });

    it('maps provider to correct env var name', () => {
      const config = {
        providers: {
          anthropic: { apiKey: 'sk-key' },
        },
        defaults: {},
        limits: { maxConcurrentAgents: 5, defaultTimeoutMs: 120000 },
      };
      expect(resolveAuthEnv('anthropic', config)).toEqual({ ANTHROPIC_API_KEY: 'sk-key' });
    });

    it('uses custom apiKeyEnvVar when provided', () => {
      const config = {
        providers: {
          custom: { apiKey: 'secret', apiKeyEnvVar: 'MY_CUSTOM_KEY' },
        },
        defaults: {},
        limits: { maxConcurrentAgents: 5, defaultTimeoutMs: 120000 },
      };
      expect(resolveAuthEnv('custom', config)).toEqual({ MY_CUSTOM_KEY: 'secret' });
    });

    it('includes baseUrl when provided', () => {
      const config = {
        providers: {
          openai: { apiKey: 'sk-key', baseUrl: 'https://api.example.com' },
        },
        defaults: {},
        limits: { maxConcurrentAgents: 5, defaultTimeoutMs: 120000 },
      };
      expect(resolveAuthEnv('openai', config)).toEqual({
        OPENAI_API_KEY: 'sk-key',
        OPENAI_BASE_URL: 'https://api.example.com',
      });
    });
  });

  describe('providerToEnvVar (via resolveAuthEnv)', () => {
    it('handles known providers', () => {
      const config = {
        providers: {
          openai: { apiKey: 'k' },
          groq: { apiKey: 'k' },
          deepseek: { apiKey: 'k' },
          'google-vertex': { apiKey: 'k' },
        },
        defaults: {},
        limits: { maxConcurrentAgents: 5, defaultTimeoutMs: 120000 },
      };
      expect(resolveAuthEnv('openai', config)).toHaveProperty('OPENAI_API_KEY');
      expect(resolveAuthEnv('groq', config)).toHaveProperty('GROQ_API_KEY');
      expect(resolveAuthEnv('deepseek', config)).toHaveProperty('DEEPSEEK_API_KEY');
      expect(resolveAuthEnv('google-vertex', config)).toHaveProperty('GOOGLE_APPLICATION_CREDENTIALS');
    });

    it('falls back for unknown providers', () => {
      const config = {
        providers: {
          myprovider: { apiKey: 'k' },
          'my-provider': { apiKey: 'k' },
        },
        defaults: {},
        limits: { maxConcurrentAgents: 5, defaultTimeoutMs: 120000 },
      };
      expect(resolveAuthEnv('myprovider', config)).toHaveProperty('MYPROVIDER_API_KEY');
      expect(resolveAuthEnv('my-provider', config)).toHaveProperty('MY_PROVIDER_API_KEY');
    });
  });
});
