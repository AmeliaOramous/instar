/**
 * Integration test — WhatsApp HTTP routes through the full Express pipeline.
 *
 * Tests /whatsapp/status, /whatsapp/qr, /messaging/bridge endpoints
 * with real WhatsAppAdapter and MessageBridge instances (no mocks for
 * adapter internals). Only external network dependencies are absent.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import request from 'supertest';
import { AgentServer } from '../../src/server/AgentServer.js';
import { WhatsAppAdapter } from '../../src/messaging/WhatsAppAdapter.js';
import { MessageBridge } from '../../src/messaging/shared/MessageBridge.js';
import { createTempProject, createMockSessionManager } from '../helpers/setup.js';
import type { TempProject, MockSessionManager } from '../helpers/setup.js';
import type { InstarConfig } from '../../src/core/types.js';

describe('WhatsApp HTTP routes integration', () => {
  let project: TempProject;
  let mockSM: MockSessionManager;
  let whatsapp: WhatsAppAdapter;
  let bridge: MessageBridge;
  let server: AgentServer;
  let app: ReturnType<AgentServer['getApp']>;
  const AUTH_TOKEN = 'whatsapp-routes-test-token';

  beforeAll(() => {
    project = createTempProject();
    mockSM = createMockSessionManager();

    // Create WhatsApp adapter with real shared infrastructure (no Baileys backend)
    whatsapp = new WhatsAppAdapter(
      { backend: 'baileys', authorizedNumbers: ['+14155552671'], requireConsent: false },
      project.stateDir,
    );

    // Create MessageBridge with real persistence
    bridge = new MessageBridge({
      registryPath: path.join(project.stateDir, 'bridge-registry.json'),
    });

    const config: InstarConfig = {
      projectName: 'whatsapp-routes-test',
      projectDir: project.dir,
      stateDir: project.stateDir,
      port: 0,
      authToken: AUTH_TOKEN,
      sessions: {
        tmuxPath: '/usr/bin/tmux',
        claudePath: '/usr/bin/claude',
        projectDir: project.dir,
        maxSessions: 5,
        protectedSessions: [],
        completionPatterns: [],
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
      whatsapp: whatsapp,
      messageBridge: bridge,
    });
    app = server.getApp();
  });

  afterAll(() => {
    project.cleanup();
  });

  // ── Auth enforcement ─────────────────────────────────────────

  describe('auth enforcement', () => {
    it('returns 401 for /whatsapp/status without Bearer token', async () => {
      const res = await request(app).get('/whatsapp/status');
      expect(res.status).toBe(401);
    });

    it('returns 401 for /whatsapp/qr without Bearer token', async () => {
      const res = await request(app).get('/whatsapp/qr');
      expect(res.status).toBe(401);
    });

    it('returns 401 for /messaging/bridge without Bearer token', async () => {
      const res = await request(app).get('/messaging/bridge');
      expect(res.status).toBe(401);
    });
  });

  // ── /whatsapp/status ─────────────────────────────────────────

  describe('GET /whatsapp/status', () => {
    it('returns adapter status with proper shape', async () => {
      const res = await request(app)
        .get('/whatsapp/status')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('state');
      expect(res.body).toHaveProperty('phoneNumber');
      expect(res.body).toHaveProperty('reconnectAttempts');
      expect(res.body).toHaveProperty('lastConnected');
      expect(res.body).toHaveProperty('pendingMessages');
      expect(res.body).toHaveProperty('stalledChannels');
      expect(res.body).toHaveProperty('registeredSessions');
      expect(res.body).toHaveProperty('totalMessagesLogged');
    });

    it('reports disconnected state initially', async () => {
      const res = await request(app)
        .get('/whatsapp/status')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.state).toBe('disconnected');
      expect(res.body.phoneNumber).toBeNull();
      expect(res.body.reconnectAttempts).toBe(0);
      expect(res.body.lastConnected).toBeNull();
    });

    it('reflects connection state changes', async () => {
      await whatsapp.setConnectionState('connected', '+14155552671');

      const res = await request(app)
        .get('/whatsapp/status')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.state).toBe('connected');
      expect(res.body.phoneNumber).toBe('+14155552671');
      expect(res.body.lastConnected).not.toBeNull();

      // Reset for subsequent tests
      await whatsapp.setConnectionState('disconnected');
    });
  });

  // ── /whatsapp/qr ─────────────────────────────────────────

  describe('GET /whatsapp/qr', () => {
    it('returns null QR code initially', async () => {
      const res = await request(app)
        .get('/whatsapp/qr')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('qr');
      expect(res.body).toHaveProperty('state');
      expect(res.body).toHaveProperty('phoneNumber');
      expect(res.body.qr).toBeNull();
    });

    it('returns QR code after setQrCode is called', async () => {
      whatsapp.setQrCode('test-qr-code-data');

      const res = await request(app)
        .get('/whatsapp/qr')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.qr).toBe('test-qr-code-data');
    });

    it('returns null QR after connection clears it', async () => {
      whatsapp.setQrCode('another-qr');
      await whatsapp.setConnectionState('connected', '+14155559999');

      const res = await request(app)
        .get('/whatsapp/qr')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.qr).toBeNull();
      expect(res.body.state).toBe('connected');
      expect(res.body.phoneNumber).toBe('+14155559999');

      // Reset
      await whatsapp.setConnectionState('disconnected');
    });
  });

  // ── /messaging/bridge ─────────────────────────────────────────

  describe('GET /messaging/bridge', () => {
    it('returns bridge status with zero links initially', async () => {
      const res = await request(app)
        .get('/messaging/bridge')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('started');
      expect(res.body).toHaveProperty('linkCount');
      expect(res.body).toHaveProperty('messagesBridged');
      expect(res.body).toHaveProperty('lastBridgedAt');
      expect(res.body).toHaveProperty('links');
      expect(res.body.linkCount).toBe(0);
      expect(res.body.links).toEqual([]);
      expect(res.body.messagesBridged).toBe(0);
    });

    it('reflects added bridge links', async () => {
      bridge.addLink('14155552671@s.whatsapp.net', 12345, 'test-admin');

      const res = await request(app)
        .get('/messaging/bridge')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.linkCount).toBe(1);
      expect(res.body.links).toHaveLength(1);
      expect(res.body.links[0].whatsappChannelId).toBe('14155552671@s.whatsapp.net');
      expect(res.body.links[0].telegramTopicId).toBe(12345);
      expect(res.body.links[0].createdBy).toBe('test-admin');
    });

    it('reflects multiple bridge links', async () => {
      bridge.addLink('14155559999@s.whatsapp.net', 67890, 'test-admin');

      const res = await request(app)
        .get('/messaging/bridge')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.linkCount).toBe(2);
      expect(res.body.links).toHaveLength(2);
    });
  });

  // ── 503 when not configured ─────────────────────────────────

  describe('503 when WhatsApp/bridge not configured', () => {
    let bareServer: AgentServer;
    let bareApp: ReturnType<AgentServer['getApp']>;

    beforeAll(() => {
      const config: InstarConfig = {
        projectName: 'bare-server-test',
        projectDir: project.dir,
        stateDir: project.stateDir,
        port: 0,
        authToken: AUTH_TOKEN,
        sessions: {
          tmuxPath: '/usr/bin/tmux',
          claudePath: '/usr/bin/claude',
          projectDir: project.dir,
          maxSessions: 5,
          protectedSessions: [],
          completionPatterns: [],
        },
        users: [],
        messaging: [],
        monitoring: {
          quotaTracking: false,
          memoryMonitoring: false,
          healthCheckIntervalMs: 30000,
        },
      };

      bareServer = new AgentServer({
        config,
        sessionManager: mockSM as any,
        state: project.state,
        // No whatsapp, no messageBridge
      });
      bareApp = bareServer.getApp();
    });

    it('returns 503 for /whatsapp/status when adapter not configured', async () => {
      const res = await request(bareApp)
        .get('/whatsapp/status')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`);

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('WhatsApp not configured');
    });

    it('returns 503 for /whatsapp/qr when adapter not configured', async () => {
      const res = await request(bareApp)
        .get('/whatsapp/qr')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`);

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('WhatsApp not configured');
    });

    it('returns 503 for /messaging/bridge when bridge not configured', async () => {
      const res = await request(bareApp)
        .get('/messaging/bridge')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`);

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Message bridge not configured');
    });
  });
});
