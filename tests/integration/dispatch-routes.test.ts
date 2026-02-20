/**
 * Integration test — dispatch routes.
 *
 * Tests the dispatch API endpoints through the full server stack.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { AgentServer } from '../../src/server/AgentServer.js';
import { DispatchManager } from '../../src/core/DispatchManager.js';
import { createTempProject, createMockSessionManager } from '../helpers/setup.js';
import type { TempProject } from '../helpers/setup.js';
import type { InstarConfig } from '../../src/core/types.js';
import type { Dispatch } from '../../src/core/DispatchManager.js';

describe('Dispatch Routes (integration)', () => {
  let project: TempProject;
  let server: AgentServer;
  let app: ReturnType<AgentServer['getApp']>;
  let dispatches: DispatchManager;
  let dispatchFile: string;
  const AUTH_TOKEN = 'test-dispatch-token';

  beforeAll(() => {
    project = createTempProject();
    const mockSM = createMockSessionManager();
    dispatchFile = path.join(project.stateDir, 'state', 'dispatches.json');

    dispatches = new DispatchManager({
      enabled: false, // Polling disabled for tests — we test routes directly
      dispatchUrl: 'https://example.com/dispatches',
      dispatchFile,
      version: '0.1.12',
    });

    const config: InstarConfig = {
      projectName: 'dispatch-test',
      projectDir: project.dir,
      stateDir: project.stateDir,
      port: 0,
      authToken: AUTH_TOKEN,
      sessions: {
        tmuxPath: '/usr/bin/tmux',
        claudePath: '/usr/bin/claude',
        projectDir: project.dir,
        maxSessions: 3,
        protectedSessions: [],
        completionPatterns: [],
      },
      scheduler: {
        jobsFile: '',
        enabled: false,
        maxParallelJobs: 1,
        quotaThresholds: { normal: 50, elevated: 70, critical: 85, shutdown: 95 },
      },
      users: [],
      messaging: [],
      monitoring: {
        quotaTracking: false,
        memoryMonitoring: false,
        healthCheckIntervalMs: 30000,
      },
    };

    server = new AgentServer({
      config,
      sessionManager: mockSM as any,
      state: project.state,
      dispatches,
    });
    app = server.getApp();
  });

  afterAll(() => {
    project.cleanup();
  });

  it('GET /dispatches/pending returns empty when no dispatches', async () => {
    const res = await request(app)
      .get('/dispatches/pending')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.dispatches).toEqual([]);
  });

  it('GET /dispatches/context returns empty string when no dispatches', async () => {
    const res = await request(app)
      .get('/dispatches/context')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.context).toBe('');
  });

  it('GET /dispatches/pending returns dispatches after seeding', async () => {
    // Seed dispatch data
    const testDispatches: Dispatch[] = [
      {
        dispatchId: 'dsp-route-test1',
        type: 'strategy',
        title: 'Route Test Strategy',
        content: 'Test content for route testing.',
        priority: 'high',
        createdAt: '2026-02-20T00:00:00Z',
        receivedAt: '2026-02-20T01:00:00Z',
        applied: false,
      },
      {
        dispatchId: 'dsp-route-test2',
        type: 'behavioral',
        title: 'Route Test Behavioral',
        content: 'Another test dispatch.',
        priority: 'normal',
        createdAt: '2026-02-20T02:00:00Z',
        receivedAt: '2026-02-20T03:00:00Z',
        applied: false,
      },
    ];
    fs.writeFileSync(dispatchFile, JSON.stringify(testDispatches));

    const res = await request(app)
      .get('/dispatches/pending')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.dispatches).toHaveLength(2);
  });

  it('GET /dispatches/context returns formatted context', async () => {
    const res = await request(app)
      .get('/dispatches/context')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.context).toContain('Intelligence Dispatches');
    expect(res.body.context).toContain('Route Test Strategy');
    expect(res.body.context).toContain('[HIGH]');
  });

  it('POST /dispatches/:id/apply marks dispatch as applied', async () => {
    const res = await request(app)
      .post('/dispatches/dsp-route-test1/apply')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(true);

    // Verify it's no longer pending
    const pendingRes = await request(app)
      .get('/dispatches/pending')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`);

    expect(pendingRes.body.dispatches).toHaveLength(1);
    expect(pendingRes.body.dispatches[0].dispatchId).toBe('dsp-route-test2');
  });

  it('POST /dispatches/:id/apply returns 404 for non-existent dispatch', async () => {
    const res = await request(app)
      .post('/dispatches/dsp-nonexistent/apply')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`);

    expect(res.status).toBe(404);
  });

  it('requires auth for dispatch routes', async () => {
    const pending = await request(app).get('/dispatches/pending');
    expect(pending.status).toBe(401);

    const apply = await request(app).post('/dispatches/dsp-test/apply');
    expect(apply.status).toBe(401);
  });
});
