import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { PiBridge } from '../src/bridge.js';

const mockSpawn = vi.fn();
const mockPrompt = vi.fn();
const mockSteer = vi.fn();
const mockGetState = vi.fn();
const mockGetResult = vi.fn();
const mockList = vi.fn();
const mockStop = vi.fn();
const mockBash = vi.fn();
const mockCompact = vi.fn();
const mockStopAll = vi.fn();
const mockGet = vi.fn();

vi.mock('../src/bridge.js', () => ({
  PiBridge: vi.fn().mockImplementation(() => ({
    spawn: mockSpawn,
    prompt: mockPrompt,
    steer: mockSteer,
    getState: mockGetState,
    getResult: mockGetResult,
    list: mockList,
    stop: mockStop,
    bash: mockBash,
    compact: mockCompact,
    stopAll: mockStopAll,
    get: mockGet,
  })),
}));

vi.mock('../src/config.js', () => ({
  loadConfig: vi.fn(() => ({
    providers: {},
    defaults: {},
    limits: { maxConcurrentAgents: 5, defaultTimeoutMs: 120000 },
  })),
}));

async function makeRequest(
  server: Server,
  path: string,
  body?: Record<string, unknown>
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const port = (server.address() as any)?.port ?? 0;
    const req = require('node:http').request(
      { hostname: '127.0.0.1', port, path, method: 'POST', headers: { 'Content-Type': 'application/json' } },
      (res: any) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 0, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode ?? 0, data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('http-server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.CLAUDE_PI_BRIDGE_PORT;
  });

  async function createTestServer(): Promise<Server> {
    const { loadConfig } = await import('../src/config.js');
    const { PiBridge } = await import('../src/bridge.js');
    const bridge = new PiBridge(loadConfig());

    return new Promise((resolve) => {
      const srv = createServer(async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        const url = new URL(req.url ?? '/', `http://localhost`);
        let data = '';
        req.on('data', (chunk) => (data += chunk));
        req.on('end', async () => {
          let body: Record<string, unknown> = {};
          try { body = JSON.parse(data); } catch { /* ignore */ }
          try {
            switch (url.pathname) {
              case '/spawn': {
                const { name, cwd, provider, model, thinkingLevel, initialPrompt } = body;
                await bridge.spawn(String(name), {
                  cwd: String(cwd),
                  provider: provider ? String(provider) : undefined,
                  model: model ? String(model) : undefined,
                  thinkingLevel: thinkingLevel as any,
                  initialPrompt: initialPrompt ? String(initialPrompt) : undefined,
                });
                res.end(JSON.stringify({ ok: true }));
                break;
              }
              case '/list': {
                res.end(JSON.stringify({ ok: true, agents: bridge.list() }));
                break;
              }
              case '/stop': {
                await bridge.stop(String(body.id));
                res.end(JSON.stringify({ ok: true }));
                break;
              }
              default:
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'Not found' }));
            }
          } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
          }
        });
      });
      srv.listen(0, () => resolve(srv));
    });
  }

  it('POST /list returns empty agents array', async () => {
    const srv = await createTestServer();
    mockList.mockReturnValue([]);
    const { status, data } = await makeRequest(srv, '/list');
    expect(status).toBe(200);
    expect(data).toEqual({ ok: true, agents: [] });
    srv.close();
  });

  it('POST /spawn creates agent', async () => {
    const srv = await createTestServer();
    mockSpawn.mockResolvedValue(undefined);
    const { status, data } = await makeRequest(srv, '/spawn', { name: 'a1', cwd: '/tmp' });
    expect(status).toBe(200);
    expect(data).toEqual({ ok: true });
    srv.close();
  });

  it('POST /stop returns ok', async () => {
    const srv = await createTestServer();
    mockStop.mockResolvedValue(undefined);
    const { status, data } = await makeRequest(srv, '/stop', { id: 'a1' });
    expect(status).toBe(200);
    expect(data).toEqual({ ok: true });
    srv.close();
  });

  it('returns 404 for unknown paths', async () => {
    const srv = await createTestServer();
    const { status, data } = await makeRequest(srv, '/unknown');
    expect(status).toBe(404);
    expect(data).toEqual({ error: 'Not found' });
    srv.close();
  });
});
