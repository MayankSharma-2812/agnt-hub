import path from 'node:path';
import { HubdConfig, getDefaultLogsDir } from './config.js';
import { HubClient, TaskDetail } from './client.js';
import { WorktreeManager, getBranchName } from './worktree.js';
import { buildTaskPrompt } from './prompt.js';
import { TaskRunner } from './runner.js';
import { Task, Agent } from '@agent-hub/shared';

export interface DaemonState {
  isRunning: boolean;
  activeTaskId: string | null;
  runsToday: number;
  lastRunDate: string; // YYYY-MM-DD
  backoffMinutes: number;
  backoffUntil: number; // timestamp
}

export class HubDaemon {
  private client: HubClient;
  private worktreeMgr: WorktreeManager;
  private runner: TaskRunner;
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private state: DaemonState;

  constructor(private config: HubdConfig) {
    this.client = new HubClient(config);
    this.worktreeMgr = new WorktreeManager(config.repoPath);
    this.runner = new TaskRunner();

    const today = new Date().toISOString().slice(0, 10);
    this.state = {
      isRunning: false,
      activeTaskId: null,
      runsToday: 0,
      lastRunDate: today,
      backoffMinutes: 0,
      backoffUntil: 0,
    };
  }

  getState(): DaemonState {
    this.refreshDayCap();
    return { ...this.state };
  }

  private refreshDayCap(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this.state.lastRunDate !== today) {
      this.state.lastRunDate = today;
      this.state.runsToday = 0;
    }
  }

  /**
   * Evaluates if agent is currently paused on Hub.
   */
  private async isAgentPaused(): Promise<boolean> {
    try {
      const { agents } = await this.client.getAgents();
      const current = agents.find((a: Agent) => a.name === this.config.agentName);
      if (current && (current.status as string) === 'paused') {
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }

  /**
   * Finds the next eligible task: either already claimed by this agent or ready for this agent's role.
   */
  async findNextTask(): Promise<Task | null> {
    try {
      // 1. Check tasks already claimed/in_progress for this role/agent
      const claimedRes = await this.client.getTasks({
        status: 'in_progress',
        role_required: this.config.role,
      });
      if (claimedRes.tasks.length > 0) {
        return claimedRes.tasks[0];
      }

      // 2. Check ready tasks for this role
      const readyRes = await this.client.getTasks({
        status: 'ready',
        role_required: this.config.role,
      });
      if (readyRes.tasks.length > 0) {
        return readyRes.tasks[0];
      }

      // 3. Fallback: ready tasks with no specific role assigned
      const anyReadyRes = await this.client.getTasks({
        status: 'ready',
      });
      const unassigned = anyReadyRes.tasks.find((t) => !t.role_required);
      if (unassigned) {
        return unassigned;
      }
    } catch (err) {
      console.error(`[HUBD POLL ERROR] ${(err as Error).message}`);
    }

    return null;
  }

  /**
   * Executes a single processing tick.
   */
  async tick(): Promise<{ executed: boolean; taskId?: string; reason?: string }> {
    if (this.isProcessing) {
      return { executed: false, reason: 'Already processing a task' };
    }

    this.refreshDayCap();

    // Check rate limit backoff
    const now = Date.now();
    if (this.state.backoffUntil > now) {
      const remainingSecs = Math.ceil((this.state.backoffUntil - now) / 1000);
      return {
        executed: false,
        reason: `In exponential backoff (${remainingSecs}s remaining)`,
      };
    }

    // Check daily run cap
    if (this.state.runsToday >= this.config.maxRunsPerDay) {
      return {
        executed: false,
        reason: `Daily run cap reached (${this.state.runsToday}/${this.config.maxRunsPerDay})`,
      };
    }

    // Check if paused on hub
    if (await this.isAgentPaused()) {
      return { executed: false, reason: 'Agent is paused on Hub' };
    }

    // Send heartbeat
    try {
      await this.client.heartbeat({ status: 'idle' });
    } catch {
      // ignore heartbeat failure
    }

    const task = await this.findNextTask();
    if (!task) {
      return { executed: false, reason: 'No ready tasks available' };
    }

    this.isProcessing = true;
    this.state.activeTaskId = task.id;

    try {
      await this.executeTask(task);
      return { executed: true, taskId: task.id };
    } finally {
      this.isProcessing = false;
      this.state.activeTaskId = null;
    }
  }

  /**
   * Executes a full task run with worktree isolation, prompt assembly, and status updates.
   */
  async executeTask(task: Task): Promise<void> {
    console.log(`[HUBD] Starting execution for task [${task.id}] "${task.title}"`);

    // 1. Claim task if status is ready
    let currentTask = task;
    if (currentTask.status === 'ready') {
      try {
        const claimRes = await this.client.claimTask(task.id, task.version);
        currentTask = claimRes.task;
        console.log(`[HUBD] Successfully claimed task ${task.id}`);
      } catch (err) {
        console.warn(`[HUBD] Failed to claim task ${task.id}: ${(err as Error).message}`);
        return;
      }
    }

    const branchName = getBranchName(this.config.role, task.id, task.title);

    // 2. Update status to in_progress
    try {
      await this.client.updateTaskStatus(task.id, 'in_progress', {
        branch: branchName,
      });
      await this.client.heartbeat({ status: 'working', current_task_id: task.id });
    } catch (err) {
      console.warn(`[HUBD] Could not mark task in_progress: ${(err as Error).message}`);
    }

    // 3. Create git worktree
    console.log(`[HUBD] Creating git worktree on branch ${branchName}...`);
    const { worktreePath } = this.worktreeMgr.createWorktree(branchName);

    // 4. Fetch full task context including messages
    let taskDetail: TaskDetail | null = null;
    try {
      taskDetail = await this.client.getTask(task.id);
    } catch {
      // fallback
    }

    // 5. Assemble prompt
    const prompt = buildTaskPrompt({
      task: currentTask,
      messages: taskDetail?.messages || [],
      role: this.config.role,
      branch: branchName,
    });

    // 6. Start Run record on Hub
    const logFilename = `${Date.now()}-${task.id}.log`;
    const logPath = path.join(getDefaultLogsDir(), logFilename);

    let runId: string | null = null;
    try {
      const runRes = await this.client.createRun({
        task_id: task.id,
        status: 'running',
        model: this.config.model,
        log_path: logPath,
        note: `Started by hubd in worktree ${worktreePath}`,
      });
      runId = runRes.run.id;
    } catch (err) {
      console.warn(`[HUBD] Could not record run start: ${(err as Error).message}`);
    }

    // 7. Execute agy runner in worktree
    const runResult = await this.runner.runTask({
      agyPath: this.config.agyPath,
      worktreePath,
      prompt,
      logPath,
      timeoutMinutes: this.config.runTimeoutMinutes,
      autoApprove: this.config.autoApprove,
      model: this.config.model,
    });

    console.log(`[HUBD] Task runner finished with status: ${runResult.status} (exit ${runResult.exitCode})`);

    // Increment daily run count
    this.state.runsToday++;

    // 8. Update run record on Hub
    if (runId) {
      try {
        await this.client.updateRun(runId, {
          status: runResult.status,
          exit_code: runResult.exitCode,
          note: runResult.note,
        });
      } catch (err) {
        console.warn(`[HUBD] Failed to update run status: ${(err as Error).message}`);
      }
    }

    // 9. Post-run Git checks
    const hasCommits = this.worktreeMgr.hasNewCommits(worktreePath, branchName);
    let pushedSuccessfully = false;

    if (hasCommits) {
      try {
        console.log(`[HUBD] New commits detected. Pushing branch ${branchName}...`);
        this.worktreeMgr.pushBranch(worktreePath, branchName, 'origin');
        pushedSuccessfully = true;

        // Record artifact on Hub
        await this.client.postArtifact({
          task_id: task.id,
          kind: 'pr',
          title: `Branch ${branchName}`,
          uri: `https://github.com/agent-hub/smt/tree/${branchName}`,
          summary: `Automated PR branch pushed by hubd`,
        });
      } catch (err) {
        console.warn(`[HUBD] Branch push warning: ${(err as Error).message}`);
      }
    }

    // 10. Update task final status
    try {
      // Check latest task status from Hub to see if agent moved it itself
      const freshDetail = await this.client.getTask(task.id);
      const latestStatus = freshDetail.task.status;

      // If task is still claimed or in_progress, finalize it
      if (latestStatus === 'claimed' || latestStatus === 'in_progress') {
        if (runResult.status === 'succeeded' && (hasCommits || pushedSuccessfully)) {
          await this.client.updateTaskStatus(task.id, 'in_review', {
            branch: branchName,
            note: 'hubd completed run and pushed branch for review',
          });
          console.log(`[HUBD] Task ${task.id} moved to in_review`);
        } else {
          // If execution failed, timed out, or made no commits, mark blocked
          await this.client.updateTaskStatus(task.id, 'blocked', {
            note: `Agent exited with status '${runResult.status}': ${runResult.note}`,
          });
          console.log(`[HUBD] Task ${task.id} marked as blocked`);
        }
      }
    } catch (err) {
      console.warn(`[HUBD] Error updating final task status: ${(err as Error).message}`);
    }

    // 11. Rate limit handling and orchestrator notification
    if (runResult.status === 'rate_limited') {
      const nextBackoff = this.state.backoffMinutes === 0 ? 1 : Math.min(this.state.backoffMinutes * 2, 30);
      this.state.backoffMinutes = nextBackoff;
      this.state.backoffUntil = Date.now() + nextBackoff * 60 * 1000;

      console.warn(`[HUBD RATE LIMIT] Backing off for ${nextBackoff} minute(s)`);

      try {
        await this.client.postMessage({
          project_id: task.project_id,
          task_id: task.id,
          kind: 'blocker',
          body: `Rate limit encountered during task [${task.id}]. Backing off for ${nextBackoff} minute(s).`,
        });
      } catch {
        // ignore
      }
    } else if (runResult.status === 'succeeded') {
      // Reset backoff on success
      this.state.backoffMinutes = 0;
      this.state.backoffUntil = 0;
    }

    // 12. Clean up worktree
    console.log(`[HUBD] Cleaning up worktree ${worktreePath}...`);
    this.worktreeMgr.removeWorktree(worktreePath);
  }

  /**
   * Starts periodic polling loop every 15 seconds.
   */
  start(): void {
    if (this.state.isRunning) return;
    this.state.isRunning = true;
    console.log(`[HUBD] Daemon started for agent "${this.config.agentName}" (${this.config.role})`);

    // Run first tick immediately
    this.tick().catch((err) => console.error('[HUBD TICK ERROR]', err));

    // Schedule every 15 seconds
    this.timer = setInterval(() => {
      this.tick().catch((err) => console.error('[HUBD TICK ERROR]', err));
    }, 15000);
  }

  /**
   * Stops the daemon.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.state.isRunning = false;
    console.log('[HUBD] Daemon stopped');
  }
}
