#!/usr/bin/env node

import fs from 'node:fs';
import {
  loadConfig,
  initDefaultConfig,
  getDefaultConfigPath,
  getDefaultPidPath,
} from './config.js';
import { HubDaemon } from './daemon.js';
import { runDoctor, formatDoctorReport } from './doctor.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';

  function parseConfigFlag(): string | undefined {
    const idx = args.indexOf('--config');
    if (idx !== -1 && args[idx + 1]) {
      return args[idx + 1];
    }
    return undefined;
  }

  const customConfigPath = parseConfigFlag();

  switch (command) {
    case 'init': {
      const createdPath = initDefaultConfig(customConfigPath);
      console.log(`Initialized default configuration at ${createdPath}`);
      console.log('Edit the file to configure your Hub URL and API Token before running `hubd start`.');
      process.exit(0);
      break;
    }

    case 'doctor': {
      const report = await runDoctor(customConfigPath);
      console.log(formatDoctorReport(report));
      process.exit(report.overall === 'pass' ? 0 : 1);
      break;
    }

    case 'status': {
      const pidFile = getDefaultPidPath();
      let isRunning = false;
      let pid: number | null = null;

      if (fs.existsSync(pidFile)) {
        try {
          const raw = fs.readFileSync(pidFile, 'utf8').trim();
          pid = parseInt(raw, 10);
          if (!isNaN(pid)) {
            // Check if process is alive
            process.kill(pid, 0);
            isRunning = true;
          }
        } catch {
          isRunning = false;
        }
      }

      console.log('=== hubd daemon status ===');
      console.log(`Running: ${isRunning ? `YES (PID: ${pid})` : 'NO'}`);
      console.log(`Config:  ${customConfigPath || getDefaultConfigPath()}`);

      try {
        const config = loadConfig(customConfigPath);
        console.log(`Agent:   ${config.agentName} (role: ${config.role})`);
        console.log(`Hub:     ${config.hubUrl}`);
        console.log(`Cap:     ${config.maxRunsPerDay} runs/day (timeout: ${config.runTimeoutMinutes}m)`);
      } catch (err) {
        console.log(`Config check: ${(err as Error).message}`);
      }

      process.exit(0);
      break;
    }

    case 'stop': {
      const pidFile = getDefaultPidPath();
      if (!fs.existsSync(pidFile)) {
        console.log('No running hubd daemon found (pidfile missing).');
        process.exit(0);
      }

      const raw = fs.readFileSync(pidFile, 'utf8').trim();
      const pid = parseInt(raw, 10);
      if (isNaN(pid)) {
        fs.unlinkSync(pidFile);
        console.log('Invalid pidfile removed.');
        process.exit(0);
      }

      try {
        process.kill(pid, 'SIGTERM');
        console.log(`Sent SIGTERM to hubd daemon (PID: ${pid})`);
      } catch (err) {
        console.log(`Failed to stop PID ${pid}: ${(err as Error).message}`);
      }

      if (fs.existsSync(pidFile)) {
        fs.unlinkSync(pidFile);
      }
      process.exit(0);
      break;
    }

    case 'start': {
      const isOnce = args.includes('--once');
      const config = loadConfig(customConfigPath);
      const daemon = new HubDaemon(config);

      if (isOnce) {
        console.log('[HUBD] Running single iteration (--once)...');
        const res = await daemon.tick();
        if (res.executed) {
          console.log(`[HUBD] Successfully completed task ${res.taskId}`);
        } else {
          console.log(`[HUBD] No task executed: ${res.reason || 'None'}`);
        }
        process.exit(0);
      }

      // Record PID file
      const pidFile = getDefaultPidPath();
      fs.writeFileSync(pidFile, String(process.pid), { encoding: 'utf8' });

      const cleanup = () => {
        daemon.stop();
        if (fs.existsSync(pidFile)) {
          fs.unlinkSync(pidFile);
        }
        process.exit(0);
      };

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);

      daemon.start();
      break;
    }

    default:
      console.log(`Unknown command: ${command}`);
      console.log('Usage: hubd <init | start | stop | status | doctor> [--config <path>] [--once]');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('[HUBD FATAL]', err);
  process.exit(1);
});
