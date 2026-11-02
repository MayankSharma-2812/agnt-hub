import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { initDatabase } from '../../hub/src/db/database.js';
import { buildApp } from '../../hub/src/app.js';

async function run() {
  console.log('--- Starting Playwright Smoke Test & Screenshot Capture ---');

  const { db, adminToken } = initDatabase(':memory:');
  const app = buildApp(db);

  // Seed initial project, agents, message, lock
  db.prepare("INSERT INTO projects (id, name) VALUES ('proj-1', 'Agent Hub Web Demo')").run();
  db.prepare("INSERT INTO agents (id, member_id, name, role, status) VALUES ('agent-1', (SELECT id FROM members LIMIT 1), 'backend-agent', 'backend', 'working')").run();
  db.prepare("INSERT INTO agents (id, member_id, name, role, status) VALUES ('agent-2', (SELECT id FROM members LIMIT 1), 'frontend-agent', 'frontend', 'idle')").run();
  db.prepare("INSERT INTO messages (id, project_id, kind, body) VALUES ('msg-1', 'proj-1', 'question', 'Should we support dark mode tokens by default?')").run();
  db.prepare("INSERT INTO file_locks (id, project_id, agent_id, path_glob, expires_at) VALUES ('lock-1', 'proj-1', 'agent-1', 'apps/hub/src/**', datetime('now', '+1 hour'))").run();

  const address = await app.listen({ port: 3950, host: '127.0.0.1' });
  console.log(`Hub test server running on ${address}`);

  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const screenshotsDir = path.resolve(process.cwd(), 'screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });

  // Test helper
  async function captureScreens(viewport: { width: number; height: number }, prefix: string) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();

    // 1. Sign In screen
    await page.goto(`${address}/`);
    await page.waitForSelector('text=Agent Hub');
    await page.screenshot({ path: path.join(screenshotsDir, `${prefix}-signin.png`) });

    // Fill in sign-in form
    await page.fill('#token', adminToken!);
    await page.click('button[type="submit"]');

    // 2. Board screen
    await page.waitForSelector('button:has-text("New Task"):visible');
    await page.screenshot({ path: path.join(screenshotsDir, `${prefix}-board.png`) });

    // 3. Create a task via UI
    const taskTitle = prefix === 'desktop' ? 'Implement Realtime WebSocket/SSE Updates' : 'Mobile Responsive UI Verification';
    await page.click('button:has-text("New Task"):visible');
    await page.waitForSelector('#modalTaskTitle');
    await page.fill('#modalTaskTitle', taskTitle);
    await page.fill('#modalDescription', 'Connect frontend React components directly to hub SSE stream.');
    await page.fill('#modalAcceptanceCriteria', '- [ ] Query invalidation on SSE event\n- [ ] Card highlight');
    await page.click('button[type="submit"]');

    // Verify task appears on the board
    await page.waitForSelector(`text=${taskTitle}`);

    // 4. Task Drawer
    await page.click(`text=${taskTitle}`);
    await page.waitForSelector('text=Spec & Criteria');
    await page.screenshot({ path: path.join(screenshotsDir, `${prefix}-drawer.png`) });
    // Close drawer
    await page.click('button[aria-label="Close Drawer"]');

    // 5. Agents Screen
    await page.click('button:has-text("Agents"):visible');
    await page.waitForSelector('text=backend-agent');
    await page.screenshot({ path: path.join(screenshotsDir, `${prefix}-agents.png`) });

    // 6. Inbox Screen
    await page.click('button:has-text("Inbox"):visible');
    await page.waitForSelector('text=Should we support dark mode tokens by default?');
    await page.screenshot({ path: path.join(screenshotsDir, `${prefix}-inbox.png`) });

    // 7. Locks Screen
    await page.click('button:has-text("Locks"):visible');
    await page.waitForSelector('text=apps/hub/src/**');
    await page.screenshot({ path: path.join(screenshotsDir, `${prefix}-locks.png`) });

    // 8. Activity Screen
    await page.click('button:has-text("Activity"):visible');
    await page.waitForSelector('text=task.created');
    await page.screenshot({ path: path.join(screenshotsDir, `${prefix}-activity.png`) });

    // 9. Setup Screen
    await page.click('button:has-text("Setup"):visible');
    await page.waitForSelector('text=mcp_config.json');
    await page.screenshot({ path: path.join(screenshotsDir, `${prefix}-setup.png`) });

    await context.close();
  }

  try {
    console.log('Capturing desktop screenshots (1280x800)...');
    await captureScreens({ width: 1280, height: 800 }, 'desktop');

    console.log('Capturing mobile screenshots (390x844)...');
    await captureScreens({ width: 390, height: 844 }, 'mobile');

    console.log('All screenshots captured successfully in apps/web/screenshots!');
  } finally {
    await browser.close();
    await app.close();
  }
}

run().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
