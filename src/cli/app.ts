import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { AuditLogger } from "../core/audit/index.js";
import { runBuildCycle } from "../core/build/index.js";
import { createTaskGraphFromPrd, writeTaskGraph } from "../core/build/taskGraph.js";
import { detectClaudeCapabilities, bootstrapClaude } from "../core/claude/index.js";
import { validateProjectConsistency } from "../core/consistency/index.js";
import { resolveIntent } from "../core/intent/index.js";
import { listPlugins, installPlugin, removePlugin } from "../core/plugins/index.js";
import { listPolicyPacks, applyPolicyPack, getActivePolicy } from "../core/policy/index.js";
import {
  detectUnknowns,
  interviewCandidates,
  parsePrd,
  writeInterviewArtifacts,
  createLockArtifacts,
  validateLockHash,
} from "../core/prd/index.js";
import {
  listModels,
  setActiveModel,
  setRoles,
  parseRoleToken,
  listKeyStatuses,
  getApiKey,
  setApiKey,
  deleteApiKey,
  checkAllProviderHealth,
  generateProviderChatCompletion,
  type ProviderChatMessage,
} from "../core/providers/index.js";
import { checkReadiness } from "../core/readiness/index.js";
import { inspectRepo } from "../core/repo/index.js";
import { assessTaskGraphRisk, runStaticAnalysis } from "../core/risk/index.js";
import { hardenKit } from "../core/rubric/index.js";
import { runCommandWithSandbox, sandboxStatus, setSandboxEnabled } from "../core/sandbox/index.js";
import { assertTransition, STATE_VALUES, type TransitionContext } from "../core/state/machine.js";
import { ensureState, saveState, type OtobotState } from "../core/state/store.js";
import { withBuildTelemetry, withCommandTelemetry, withProviderHealth } from "../core/telemetry/index.js";
import { startWatch, stopWatch, watchStatus } from "../core/watch/index.js";
import { MetadataDb } from "../db/index.js";

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

const CHAT_HISTORY_LIMIT = 12;
const PRD_CHAT_CONTEXT_LIMIT = 14000;
const PRD_CHAT_ALLOWED_STATES = new Set([
  "PRD_LOADED",
  "INTERVIEWING",
  "LOCKED",
  "BOOTSTRAPPED",
  "HARDENED",
  "REFRESHED",
  "PLANNING",
  "IMPLEMENTING",
  "REVIEWING",
  "TESTING",
  "DEBUGGING",
  "CHANGE_REQUEST",
]);

export class OtobotApp {
  private state!: OtobotState;
  private readonly audit: AuditLogger;
  private readonly db: MetadataDb;
  private lastPrdPath: string | null = null;
  private prdChatEnabled = false;
  private prdChatHistory: ChatTurn[] = [];

  constructor(private readonly projectRoot: string) {
    this.audit = new AuditLogger(projectRoot);
    this.db = new MetadataDb(projectRoot);
  }

  async init(): Promise<void> {
    this.state = await ensureState(this.projectRoot);
    this.db.upsertProject({
      id: this.state.projectId,
      rootPath: this.projectRoot,
      name: "otobot",
      currentState: this.state.state,
    });

    const defaultPrdPath = join(this.projectRoot, "prd.md");
    if (await this.exists(defaultPrdPath)) {
      this.lastPrdPath = defaultPrdPath;
    }

    if (PRD_CHAT_ALLOWED_STATES.has(this.state.state)) {
      this.prdChatEnabled = true;
    }
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private modelSelectionFile(): string {
    return join(this.projectRoot, ".otobot", "model-selection.json");
  }

  private async markModelSelection(provider: "openai" | "google" | "anthropic", modelId: string): Promise<void> {
    await mkdir(join(this.projectRoot, ".otobot"), { recursive: true });
    await writeFile(
      this.modelSelectionFile(),
      JSON.stringify(
        {
          provider,
          modelId,
          selectedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  private async hasExplicitModelSelection(): Promise<boolean> {
    try {
      const raw = await readFile(this.modelSelectionFile(), "utf8");
      const parsed = JSON.parse(raw) as { provider?: string; modelId?: string };
      return (
        parsed.provider === this.state.activeProvider.provider && parsed.modelId === this.state.activeProvider.modelId
      );
    } catch {
      return false;
    }
  }

  private bootstrapAlreadyCompleted(): boolean {
    const postBootstrapStates = new Set([
      "BOOTSTRAPPED",
      "HARDENED",
      "REFRESHED",
      "PLANNING",
      "IMPLEMENTING",
      "REVIEWING",
      "TESTING",
      "SHIPPED",
      "DEBUGGING",
      "FAILED",
    ]);

    if (this.state.state === "PAUSED" && this.state.session.lastActiveState) {
      return postBootstrapStates.has(this.state.session.lastActiveState);
    }

    return postBootstrapStates.has(this.state.state);
  }

  private evaluateReviewGate(
    graphRaw: unknown,
  ): { ok: true } | { ok: false; fallback: "IMPLEMENTING" | "PLANNING"; reason: string } {
    if (process.env.OTOBOT_FORCE_REVIEW_FAIL === "1") {
      return {
        ok: false,
        fallback: "IMPLEMENTING",
        reason: "Forced review failure (OTOBOT_FORCE_REVIEW_FAIL=1)",
      };
    }

    const graph = graphRaw as {
      epics?: Array<{
        stories?: Array<{
          tasks?: Array<{
            id?: string;
            tests?: string[];
            acceptanceCriteria?: string[];
          }>;
        }>;
      }>;
    };

    const tasks =
      graph.epics?.flatMap((epic) => epic.stories?.flatMap((story) => story.tasks ?? []) ?? []) ?? [];

    const missingTests = tasks.find((task) => (task.tests?.length ?? 0) === 0);
    if (missingTests) {
      return {
        ok: false,
        fallback: "PLANNING",
        reason: `Task ${missingTests.id ?? "unknown"} has no test command`,
      };
    }

    const missingCriteria = tasks.find((task) => (task.acceptanceCriteria?.length ?? 0) === 0);
    if (missingCriteria) {
      return {
        ok: false,
        fallback: "PLANNING",
        reason: `Task ${missingCriteria.id ?? "unknown"} has no acceptance criteria`,
      };
    }

    return { ok: true };
  }

  private async transitionContext(): Promise<TransitionContext> {
    const hasLock = await this.exists(join(this.projectRoot, "docs", "prd.lock.json"));
    const hardenedMarker = await this.exists(join(this.projectRoot, ".claude", "settings.json"));

    const stateImpliesHardened = [
      "HARDENED",
      "REFRESHED",
      "PLANNING",
      "IMPLEMENTING",
      "REVIEWING",
      "TESTING",
      "SHIPPED",
      "DEBUGGING",
      "PAUSED",
      "FAILED",
      "CHANGE_REQUEST",
    ].includes(this.state.state);

    return {
      hasLock,
      isHardened: hardenedMarker || stateImpliesHardened,
    };
  }

  private async transition(next: string, override: TransitionContext = {}): Promise<void> {
    const from = this.state.state;
    const base = await this.transitionContext();
    const context = {
      ...base,
      ...override,
    };

    assertTransition(from as never, next as never, context);
    this.state = { ...this.state, state: next };
    await saveState(this.projectRoot, this.state);
    this.db.upsertProject({
      id: this.state.projectId,
      rootPath: this.projectRoot,
      name: "otobot",
      currentState: this.state.state,
    });
    await this.audit.info("state.transition", `${from} -> ${next}`, { context });
  }

  private async transitionIfNeeded(next: string, override: TransitionContext = {}): Promise<void> {
    if (this.state.state === next) {
      return;
    }
    await this.transition(next, override);
  }

  private async afterCommand(hadError: boolean, durationMs: number): Promise<void> {
    this.state = withCommandTelemetry(this.state, hadError, durationMs);
    await saveState(this.projectRoot, this.state);
  }

  private naturalLanguageChatAllowed(): boolean {
    return this.prdChatEnabled && PRD_CHAT_ALLOWED_STATES.has(this.state.state);
  }

  private trimChatHistory(): void {
    if (this.prdChatHistory.length > CHAT_HISTORY_LIMIT) {
      this.prdChatHistory = this.prdChatHistory.slice(this.prdChatHistory.length - CHAT_HISTORY_LIMIT);
    }
  }

  private async resolvePrdPathForChat(): Promise<string> {
    const candidates = [this.lastPrdPath, join(this.projectRoot, "prd.md")].filter((path): path is string => Boolean(path));
    for (const candidate of candidates) {
      if (await this.exists(candidate)) {
        this.lastPrdPath = candidate;
        return candidate;
      }
    }

    throw new Error("No PRD found. Run /read <path> before starting natural-language chat.");
  }

  private buildPrdChatSystemPrompt(prdRaw: string): string {
    const limitedPrd =
      prdRaw.length > PRD_CHAT_CONTEXT_LIMIT
        ? `${prdRaw.slice(0, PRD_CHAT_CONTEXT_LIMIT)}\n\n[PRD content truncated to fit model context.]`
        : prdRaw;

    return [
      "You are Otobot's PRD copilot.",
      "Focus only on improving the currently loaded PRD and implementation readiness.",
      "Keep answers concise and actionable in Turkish unless user requests another language.",
      "When suggesting changes, prefer numbered edits and include concrete wording.",
      "Do not claim any file was edited unless explicitly instructed through commands.",
      "",
      "Current PRD:",
      "```md",
      limitedPrd,
      "```",
    ].join("\n");
  }

  private async prdChat(input: string): Promise<string> {
    const userMessage = input.trim();
    if (!userMessage) {
      return "";
    }

    if (!this.naturalLanguageChatAllowed()) {
      return "Natural-language PRD chat is disabled in current state. Run /read first or use /chat on.";
    }

    const prdPath = await this.resolvePrdPathForChat();
    const parsed = await parsePrd(prdPath);
    const { provider, modelId } = this.state.activeProvider;
    const apiKey = await getApiKey(this.projectRoot, provider);

    if (!apiKey) {
      const keyStatuses = await listKeyStatuses(this.projectRoot);
      const preferredFallback = (["google", "openai", "anthropic"] as const).find((candidate) => keyStatuses[candidate]);
      const fallbackSuggestion =
        preferredFallback && preferredFallback !== provider
          ? ` Try: /model set ${preferredFallback} ${
              preferredFallback === "google"
                ? "gemini-3-pro-preview"
                : preferredFallback === "openai"
                  ? "gpt-5.2"
                  : "claude-opus-4-6"
            }`
          : "";

      return `No API key for active provider (${provider}). Configure with /key set ${provider} <KEY>.${fallbackSuggestion}`;
    }

    const messages: ProviderChatMessage[] = [
      {
        role: "system",
        content: this.buildPrdChatSystemPrompt(parsed.raw),
      },
      ...this.prdChatHistory.map((turn) => ({
        role: turn.role,
        content: turn.content,
      })),
      {
        role: "user",
        content: userMessage,
      },
    ];

    const reply = await generateProviderChatCompletion({
      provider,
      modelId,
      apiKey,
      messages,
      maxOutputTokens: 900,
    });

    this.prdChatHistory.push({ role: "user", content: userMessage });
    this.prdChatHistory.push({ role: "assistant", content: reply });
    this.trimChatHistory();

    await this.audit.info("prd.chat", "PRD chat response generated", {
      provider,
      modelId,
      prdPath,
      inputChars: userMessage.length,
      outputChars: reply.length,
      historyTurns: this.prdChatHistory.length,
    });

    return reply.trim();
  }

  private async chatCommand(args: string[]): Promise<string> {
    const first = (args[0] ?? "status").toLowerCase();

    if (first === "status") {
      return `Chat status: enabled=${this.prdChatEnabled} state=${this.state.state} historyTurns=${this.prdChatHistory.length} provider=${this.state.activeProvider.provider}:${this.state.activeProvider.modelId}`;
    }

    if (first === "on") {
      this.prdChatEnabled = true;
      return "Natural-language PRD chat enabled.";
    }

    if (first === "off") {
      this.prdChatEnabled = false;
      return "Natural-language PRD chat disabled.";
    }

    if (first === "reset") {
      this.prdChatHistory = [];
      return "PRD chat history cleared.";
    }

    const message = args.join(" ").trim();
    if (!message) {
      return "Usage: /chat on|off|status|reset|<message>";
    }

    return this.prdChat(message);
  }

  async run(rawInput: string): Promise<string> {
    const input = rawInput.trim();
    if (!input) {
      return "";
    }

    const intent = !input.startsWith("/") ? resolveIntent(input) : null;
    let command = "";
    let args: string[] = [];

    if (!input.startsWith("/") && !intent && this.naturalLanguageChatAllowed()) {
      command = "/chat-nl";
      args = [input];
    } else {
      const resolved = intent ? [intent.command, ...intent.args] : input.split(/\s+/);
      [command, ...args] = resolved;
    }

    let hadError = false;
    let result = "";
    const startedAt = Date.now();

    try {
      switch (command) {
        case "/help":
          result = this.help();
          break;
        case "/doctor":
          result = await this.doctor();
          break;
        case "/ready":
          result = await this.ready();
          break;
        case "/model":
          result = await this.model(args);
          break;
        case "/roles":
          result = await this.roles(args);
          break;
        case "/key":
          result = await this.key(args);
          break;
        case "/chat":
          result = await this.chatCommand(args);
          break;
        case "/read":
          result = await this.readPrd(args);
          break;
        case "/chat-nl":
          result = await this.prdChat(args.join(" ").trim());
          break;
        case "/interview":
          result = await this.interview();
          break;
        case "/lock":
          result = await this.lock();
          break;
        case "/bootstrap":
          result = await this.bootstrap();
          break;
        case "/harden":
          result = await this.harden();
          break;
        case "/refresh":
          result = await this.refresh();
          break;
        case "/build":
          result = await this.build();
          break;
        case "/watch":
          result = await this.watch(args);
          break;
        case "/pause":
          result = await this.pause();
          break;
        case "/resume":
          result = await this.resume(args);
          break;
        case "/policy":
          result = await this.policy(args);
          break;
        case "/sandbox":
          result = await this.sandbox(args);
          break;
        case "/plugin":
          result = await this.plugin(args);
          break;
        case "/audit":
          result = await this.auditCommand(args);
          break;
        case "/exit":
          result = "__EXIT__";
          break;
        default:
          result = `Unknown command: ${command}. Try /help`;
          break;
      }
    } catch (error) {
      hadError = true;
      const message = error instanceof Error ? error.message : "Unknown error";
      await this.audit.error("command.failed", message, { command, args });
      result = `Error: ${message}`;
    } finally {
      await this.afterCommand(hadError, Date.now() - startedAt);
    }

    return result;
  }

  private help(): string {
    return [
      "Commands:",
      "/help",
      "/doctor",
      "/ready",
      "/model set <provider> <model_id>",
      "/model list [provider]",
      "/roles set planner=<provider:model_id|claude_code> reviewer=<...> executor=<...>",
      "/key set <provider> <value>",
      "/key list",
      "/key delete <provider>",
      "/chat on|off|status|reset|<message>",
      "/read <path>",
      "/interview start",
      "/lock",
      "/bootstrap",
      "/harden",
      "/refresh",
      "/build [task-id|epic-id]",
      "/watch start|stop|status",
      "/pause",
      "/resume [state]",
      "/policy pack list|apply <name>",
      "/sandbox on|off|status [provider] [profile]",
      "/sandbox run <command>",
      "/plugin list|install <name> [version]|remove <name>",
      "/audit prune [--days N]",
      "/exit",
    ].join("\n");
  }

  private async doctor(): Promise<string> {
    const capabilities = await detectClaudeCapabilities();
    this.state = { ...this.state, capabilities };
    await saveState(this.projectRoot, this.state);

    const keys = await listKeyStatuses(this.projectRoot);
    const providerHealth = await checkAllProviderHealth(this.projectRoot);
    this.state = withProviderHealth(this.state, providerHealth);
    await saveState(this.projectRoot, this.state);

    const watch = await watchStatus(this.projectRoot);
    const policy = await getActivePolicy(this.projectRoot);
    const consistency = await validateProjectConsistency(this.projectRoot);

    await this.audit.info("doctor", "Doctor check completed", {
      capabilities,
      keys,
      watch,
      policy,
      providerHealth,
      consistency,
    });

    return [
      "Doctor report:",
      `- capabilities.printMode: ${capabilities.printMode}`,
      `- capabilities.outputFormats: ${capabilities.outputFormats.join(", ")}`,
      `- capabilities.resumeLatest: ${capabilities.resumeLatest}`,
      `- capabilities.resumeById: ${capabilities.resumeById}`,
      `- keys.openai: ${keys.openai ? "configured" : "missing"}`,
      `- keys.google: ${keys.google ? "configured" : "missing"}`,
      `- keys.anthropic: ${keys.anthropic ? "configured" : "missing"}`,
      `- provider.openai.health: ${providerHealth.openai}`,
      `- provider.google.health: ${providerHealth.google}`,
      `- provider.anthropic.health: ${providerHealth.anthropic}`,
      `- watch.running: ${watch?.running ?? false}`,
      `- policy.active: ${policy?.pack.name ?? this.state.policy.activePack}`,
      `- sandbox: ${sandboxStatus(this.state)}`,
      `- consistency.ok: ${consistency.ok}`,
      ...(consistency.issues.slice(0, 2).map((issue, idx) => `- consistency.issue${idx + 1}: ${issue}`) ?? []),
      ...(consistency.warnings.slice(0, 2).map((warning, idx) => `- consistency.warning${idx + 1}: ${warning}`) ?? []),
    ].join("\n");
  }

  private async ready(): Promise<string> {
    const report = await checkReadiness(this.projectRoot);
    await this.audit.info("readiness.report", "Readiness report generated", {
      nonKeyScore: report.nonKeyScore,
      fullScore: report.fullScore,
      blockers: report.blockers,
    });

    const nonKeyCriteria = report.criteria.filter((criterion) => criterion.category === "non_key");
    const providerCriteria = report.criteria.filter((criterion) => criterion.category === "provider");

    return [
      `Readiness report (${report.generatedAt}):`,
      `- nonKey.score: ${report.nonKeyScore}%`,
      `- full.score: ${report.fullScore}%`,
      `- nonKey.pass: ${nonKeyCriteria.filter((criterion) => criterion.status === "pass").length}/${nonKeyCriteria.length}`,
      `- provider.pass: ${providerCriteria.filter((criterion) => criterion.status === "pass").length}/${providerCriteria.length}`,
      ...(report.blockers.length > 0
        ? report.blockers.map((blocker, idx) => `- blocker.${idx + 1}: ${blocker}`)
        : ["- blockers: none"]),
    ].join("\n");
  }

  private async model(args: string[]): Promise<string> {
    const [sub, providerRaw, modelId] = args;

    if (sub === "list") {
      const provider = (providerRaw as "openai" | "google" | "anthropic" | undefined) ?? this.state.activeProvider.provider;
      if (!["openai", "google", "anthropic"].includes(provider)) {
        throw new Error("Provider must be one of openai|google|anthropic");
      }
      const models = await listModels(this.projectRoot, provider as "openai" | "google" | "anthropic");
      return `${provider}: ${models.map((m) => `${m.modelId}(${m.source})`).join(", ")}`;
    }

    if (sub !== "set" || !providerRaw || !modelId) {
      const models = await listModels(this.projectRoot, this.state.activeProvider.provider);
      return `Usage: /model set <provider> <model_id>\nAvailable for ${this.state.activeProvider.provider}: ${models.map((m) => m.modelId).join(", ")}`;
    }

    if (!["openai", "google", "anthropic"].includes(providerRaw)) {
      throw new Error("Provider must be one of openai|google|anthropic");
    }

    const provider = providerRaw as "openai" | "google" | "anthropic";
    const models = await listModels(this.projectRoot, provider);
    if (!models.some((m) => m.modelId === modelId)) {
      throw new Error(`Unknown model_id for ${provider}: ${modelId}`);
    }

    const previousExecutorType = this.state.roles.executor.type;
    this.state = setActiveModel(this.state, provider, modelId);
    await saveState(this.projectRoot, this.state);
    await this.markModelSelection(provider, modelId);
    await this.audit.info("model.set", "Active model and roles updated", {
      provider,
      modelId,
      synchronizedRoles: {
        planner: `${this.state.roles.planner.type === "provider" ? `${this.state.roles.planner.provider}:${this.state.roles.planner.modelId}` : this.state.roles.planner.type}`,
        reviewer: `${this.state.roles.reviewer.type === "provider" ? `${this.state.roles.reviewer.provider}:${this.state.roles.reviewer.modelId}` : this.state.roles.reviewer.type}`,
        executor:
          this.state.roles.executor.type === "provider"
            ? `${this.state.roles.executor.provider}:${this.state.roles.executor.modelId}`
            : this.state.roles.executor.type,
      },
    });

    const executorSyncNote = previousExecutorType === "provider" ? ", executor" : "";
    return `Model updated: ${provider}:${modelId} (roles synced: planner, reviewer${executorSyncNote})`;
  }

  private async roles(args: string[]): Promise<string> {
    const [sub, ...rest] = args;
    if (sub !== "set") {
      return "Usage: /roles set planner=<provider:model_id|claude_code> reviewer=<...> executor=<...>";
    }

    const kv = Object.fromEntries(
      rest
        .map((part) => part.split("="))
        .filter((pair) => pair.length === 2)
        .map(([k, v]) => [k, v]),
    );

    const planner = parseRoleToken(kv.planner ?? `${this.state.activeProvider.provider}:${this.state.activeProvider.modelId}`);
    const reviewer = parseRoleToken(kv.reviewer ?? `${this.state.activeProvider.provider}:${this.state.activeProvider.modelId}`);
    const executor = parseRoleToken(kv.executor ?? "claude_code");

    this.state = setRoles(this.state, planner, reviewer, executor);
    await saveState(this.projectRoot, this.state);
    await this.audit.info("roles.set", "Roles updated", { planner, reviewer, executor });
    return "Roles updated.";
  }

  private async key(args: string[]): Promise<string> {
    const [sub, provider, value] = args;

    if (sub === "list") {
      const keys = await listKeyStatuses(this.projectRoot);
      return `openai=${keys.openai} google=${keys.google} anthropic=${keys.anthropic}`;
    }

    if (!provider || !["openai", "google", "anthropic"].includes(provider)) {
      return "Usage: /key set <provider> <value> | /key delete <provider> | /key list";
    }

    if (sub === "set") {
      if (!value) {
        return "Usage: /key set <provider> <value>";
      }
      await setApiKey(this.projectRoot, provider as never, value);
      await this.audit.info("key.set", "API key updated", { provider });
      return `Key set for ${provider}.`;
    }

    if (sub === "delete") {
      await deleteApiKey(this.projectRoot, provider as never);
      await this.audit.info("key.delete", "API key deleted", { provider });
      return `Key deleted for ${provider}.`;
    }

    return "Usage: /key set <provider> <value> | /key delete <provider> | /key list";
  }

  private async readPrd(args: string[]): Promise<string> {
    const path = args[0] ?? "prd.md";
    const resolved = join(this.projectRoot, path);
    await parsePrd(resolved);
    await this.transitionIfNeeded("PRD_LOADED");
    this.lastPrdPath = resolved;
    this.prdChatEnabled = true;
    this.prdChatHistory = [];
    await this.audit.info("prd.read", "PRD loaded", { path });
    return `PRD loaded from ${path}\nNatural-language PRD chat enabled. Talk directly, then run /lock when ready.`;
  }

  private async interview(): Promise<string> {
    const prdPath = this.lastPrdPath ?? join(this.projectRoot, "prd.md");
    const parsed = await parsePrd(prdPath);
    const unknowns = detectUnknowns(parsed);
    const candidates = interviewCandidates(unknowns);

    await this.transition("INTERVIEWING");

    const answers = candidates.map((c) => ({
      category: c.category,
      answer: `Accepted default: ${c.assumption}`,
    }));

    await writeInterviewArtifacts(this.projectRoot, unknowns, answers);
    await this.audit.info("prd.interview", "Interview artifacts updated", {
      unknownCount: unknowns.length,
      askedCount: candidates.length,
    });

    return `Interview completed. Unknowns=${unknowns.length}, asked=${candidates.length}`;
  }

  private async lock(): Promise<string> {
    const prdPath = this.lastPrdPath ?? join(this.projectRoot, "prd.md");
    const insights = await inspectRepo(this.projectRoot);
    const lock = await createLockArtifacts(this.projectRoot, prdPath, insights);

    await this.transition("LOCKED");
    await this.audit.info("prd.lock", "PRD lock generated", { hash: lock.prdHash });
    return `Lock created with hash ${lock.prdHash.slice(0, 12)}...`;
  }

  private async bootstrap(): Promise<string> {
    const hasLock = await this.exists(join(this.projectRoot, "docs", "prd.lock.json"));
    if (!hasLock) {
      return "Cannot bootstrap without lock. Run /lock first.";
    }

    if (this.bootstrapAlreadyCompleted()) {
      await this.audit.info("claude.bootstrap", "Bootstrap skipped: already completed", {
        state: this.state.state,
      });
      return `Bootstrap already completed (state=${this.state.state}).`;
    }

    if (this.state.state !== "LOCKED") {
      return `Cannot bootstrap from ${this.state.state}. Complete /lock first.`;
    }

    await this.transition("BOOTSTRAPPED", { hasLock: true });

    if (process.env.OTOBOT_SKIP_CLAUDE === "1") {
      await this.audit.info("claude.bootstrap", "Bootstrap skipped by env flag");
      return "Bootstrap skipped by OTOBOT_SKIP_CLAUDE=1.";
    }

    const result = await bootstrapClaude(this.state.capabilities);
    await this.audit.info("claude.bootstrap", result.ok ? "Bootstrap succeeded" : "Bootstrap failed", {
      command: result.command,
      stderr: result.stderr,
    });

    if (!result.ok) {
      return "Bootstrap attempted but claude command failed. Run /doctor to inspect capabilities.";
    }

    return "Bootstrap completed.";
  }

  private async harden(): Promise<string> {
    const insights = await inspectRepo(this.projectRoot);
    const result = await hardenKit(this.projectRoot, insights);

    if (result.score < 90) {
      await this.audit.warn("kit.harden", "Rubric below threshold", { result });
      return `Harden completed with score=${result.score}. Missing: ${result.missing.slice(0, 5).join(", ")}`;
    }

    await this.transition("HARDENED", { isHardened: true });
    await this.audit.info("kit.harden", "Rubric passed", { result });
    return `Harden passed with score=${result.score} in ${result.iterations} iteration(s).`;
  }

  private async refresh(): Promise<string> {
    const capabilities = await detectClaudeCapabilities();
    this.state = { ...this.state, capabilities };
    await saveState(this.projectRoot, this.state);
    await this.transition("REFRESHED", { isHardened: true });
    await this.audit.info("claude.refresh", "Capabilities refreshed", capabilities as unknown as Record<string, unknown>);
    return "Refresh completed.";
  }

  private async build(): Promise<string> {
    const buildStartedAt = Date.now();

    if (!(await this.hasExplicitModelSelection())) {
      await this.audit.warn("build.model_missing", "Build blocked: model selection missing", {
        provider: this.state.activeProvider.provider,
        modelId: this.state.activeProvider.modelId,
      });
      return "Build requires explicit model selection. Run /model set <provider> <model_id>.";
    }

    const check = await validateLockHash(this.projectRoot);
    if (!check.valid) {
      await this.transition("CHANGE_REQUEST", { hashMismatch: true });
      await this.audit.warn("build.hash_mismatch", "Lock hash mismatch", check as unknown as Record<string, unknown>);
      return `Hash mismatch detected. expected=${check.expected} actual=${check.actual}`;
    }

    const prdPath = this.lastPrdPath ?? join(this.projectRoot, "prd.md");
    const parsed = await parsePrd(prdPath);
    const graph = createTaskGraphFromPrd(parsed);
    await writeTaskGraph(this.projectRoot, graph);

    const rawGraph = JSON.parse(await readFile(join(this.projectRoot, "docs", "task-graph.json"), "utf8"));
    const activePolicy = await getActivePolicy(this.projectRoot);
    const policyPack = activePolicy?.pack ?? listPolicyPacks().find((pack) => pack.name === this.state.policy.activePack) ?? null;
    const risk = assessTaskGraphRisk(rawGraph);
    await this.audit.info("build.risk_assessment", "Task graph risk assessed", risk as unknown as Record<string, unknown>);
    if (risk.blockers.length > 0) {
      this.state = {
        ...this.state,
        session: {
          ...this.state.session,
          lastFailureReason: risk.blockers[0] ?? "Risk gate blocked build",
          checkpointId: "risk-gate",
        },
      };
      await saveState(this.projectRoot, this.state);
      await this.transitionIfNeeded("PLANNING");
      this.state = withBuildTelemetry(this.state, Date.now() - buildStartedAt, false);
      await saveState(this.projectRoot, this.state);
      return `Risk gate blocked build. ${risk.blockers[0]}`;
    }

    const staticAnalysis = await runStaticAnalysis(this.projectRoot, policyPack?.name === "strict");
    await this.audit.info("build.static_analysis", "Static analysis completed", staticAnalysis as unknown as Record<string, unknown>);
    if (staticAnalysis.blockers.length > 0) {
      this.state = {
        ...this.state,
        session: {
          ...this.state.session,
          lastFailureReason: staticAnalysis.blockers[0] ?? "Static analysis failed",
          checkpointId: "static-analysis",
        },
      };
      await saveState(this.projectRoot, this.state);
      await this.transitionIfNeeded("PLANNING");
      this.state = withBuildTelemetry(this.state, Date.now() - buildStartedAt, false);
      await saveState(this.projectRoot, this.state);
      return `Static analysis blocked build. ${staticAnalysis.blockers[0]}`;
    }

    await this.transitionIfNeeded("PLANNING");
    await this.transition("IMPLEMENTING");
    await this.transition("REVIEWING");

    const review = this.evaluateReviewGate(rawGraph);
    if (!review.ok) {
      await this.audit.warn("build.review_failed", "Review gate failed", {
        reason: review.reason,
        fallback: review.fallback,
      });
      await this.transition(review.fallback, { isHardened: true });
      return `Review failed: ${review.reason}. Returned to ${review.fallback}.`;
    }

    await this.transition("TESTING");

    this.state = {
      ...this.state,
      session: {
        ...this.state.session,
        currentTaskId: graph.epics[0]?.stories[0]?.tasks[0]?.id ?? null,
        checkpointId: "testing",
      },
    };

    const executeTaskCommands = process.env.OTOBOT_EXECUTE_TASK_COMMANDS === "1";
    let summary = await runBuildCycle("TESTING", rawGraph, this.audit, {
      projectRoot: this.projectRoot,
      sandbox: this.state.sandbox,
      policy: policyPack,
      executeCommands: executeTaskCommands,
    });

    if (!summary.succeeded) {
      await this.audit.warn("build.testing_failed", "Testing failed, entering debugging", {
        failedTask: summary.failedTask,
      });
      this.state = {
        ...this.state,
        session: {
          ...this.state.session,
          lastFailureReason: `Testing failed on ${summary.failedTask}`,
          checkpointId: summary.failedTask ?? "debugging",
          retryBudget: Math.max(0, this.state.session.retryBudget - 1),
        },
      };
      await saveState(this.projectRoot, this.state);
      await this.transition("DEBUGGING", { isHardened: true });
      await this.audit.info("build.retest", "Retrying tests after debugging", {
        failedTask: summary.failedTask,
      });
      await this.transition("TESTING", { isHardened: true });
      summary = await runBuildCycle("TESTING", rawGraph, this.audit, {
        projectRoot: this.projectRoot,
        sandbox: this.state.sandbox,
        policy: policyPack,
        executeCommands: executeTaskCommands,
      });
    }

    if (!summary.succeeded) {
      await this.transition("FAILED");
      this.state = withBuildTelemetry(this.state, Date.now() - buildStartedAt, false);
      await saveState(this.projectRoot, this.state);
      return `Build failed at task ${summary.failedTask} after debugging retry`;
    }

    this.state = {
      ...this.state,
      session: {
        ...this.state.session,
        currentTaskId: null,
        checkpointId: "shipped",
        lastFailureReason: null,
        retryBudget: 2,
      },
    };

    this.state = withBuildTelemetry(this.state, Date.now() - buildStartedAt, true);
    await this.transition("SHIPPED");
    await this.audit.info("build.shipped", "Build lifecycle completed", {
      completedTasks: summary.completedTasks,
      riskScore: risk.score,
      staticAnalysis: staticAnalysis.reports.map((report) => `${report.tool}:${report.status}`),
    });
    await saveState(this.projectRoot, this.state);
    return `Build succeeded. Completed tasks: ${summary.completedTasks.join(", ")}`;
  }

  private async watch(args: string[]): Promise<string> {
    const sub = args[0] ?? "status";

    if (sub === "start") {
      const session = await startWatch(this.projectRoot);
      this.state = {
        ...this.state,
        session: {
          ...this.state.session,
          watchSessionId: session.id,
        },
      };
      await saveState(this.projectRoot, this.state);
      await this.audit.info("watch.start", "Watch session started", session as unknown as Record<string, unknown>);
      return `Watch started: id=${session.id}`;
    }

    if (sub === "stop") {
      const session = await stopWatch(this.projectRoot);
      this.state = {
        ...this.state,
        session: {
          ...this.state.session,
          watchSessionId: null,
        },
      };
      await saveState(this.projectRoot, this.state);
      return session ? `Watch stopped: id=${session.id}` : "No active watch session.";
    }

    const status = await watchStatus(this.projectRoot);
    if (!status) {
      return "Watch status: no session.";
    }

    return `Watch status: running=${status.running} id=${status.id} pid=${status.pid ?? "n/a"} token=${status.reconnectToken} log=${status.logPath ?? "n/a"}`;
  }

  private async pause(): Promise<string> {
    if (this.state.state === "PAUSED") {
      return "Already paused.";
    }

    this.state = {
      ...this.state,
      session: {
        ...this.state.session,
        pausedAt: new Date().toISOString(),
        lastActiveState: this.state.state,
        checkpointId: `paused-${Date.now()}`,
      },
    };

    await this.transition("PAUSED");
    await saveState(this.projectRoot, this.state);
    return `Paused from ${this.state.session.lastActiveState}.`;
  }

  private async resume(args: string[]): Promise<string> {
    if (this.state.state !== "PAUSED") {
      return "Resume is only available from PAUSED state.";
    }

    const requested = args[0]?.toUpperCase() ?? this.state.session.lastActiveState ?? "LOCKED";
    if (!STATE_VALUES.includes(requested as never)) {
      throw new Error(`Unknown resume state: ${requested}`);
    }

    this.state = {
      ...this.state,
      session: {
        ...this.state.session,
        pausedAt: null,
      },
    };

    await this.transition(requested);
    await saveState(this.projectRoot, this.state);
    return `Resumed to ${requested}.`;
  }

  private async policy(args: string[]): Promise<string> {
    const [domain, action, name] = args;
    if (domain !== "pack") {
      return "Usage: /policy pack list | /policy pack apply <name>";
    }

    if (action === "list") {
      const packs = listPolicyPacks();
      return packs.map((p) => `${p.name}: ${p.description}`).join("\n");
    }

    if (action === "apply") {
      if (!name) {
        return "Usage: /policy pack apply <name>";
      }

      const applied = await applyPolicyPack(this.projectRoot, name);
      this.state = {
        ...this.state,
        policy: {
          activePack: applied.pack.name,
          hash: applied.hash,
          lastAppliedAt: new Date().toISOString(),
        },
      };
      await saveState(this.projectRoot, this.state);
      await this.audit.info("policy.apply", "Policy pack applied", {
        pack: applied.pack.name,
        hash: applied.hash,
      });
      return `Policy applied: ${applied.pack.name}`;
    }

    return "Usage: /policy pack list | /policy pack apply <name>";
  }

  private async sandbox(args: string[]): Promise<string> {
    const [action, providerRaw, profileRaw] = args;

    if (action === "status" || !action) {
      return `Sandbox: ${sandboxStatus(this.state)}`;
    }

    if (action === "on") {
      const provider = (providerRaw as "docker" | "podman" | "none" | undefined) ?? "docker";
      const profile = (profileRaw as "strict" | "balanced" | "off" | undefined) ?? "balanced";

      if (!["docker", "podman", "none"].includes(provider)) {
        throw new Error("Sandbox provider must be docker|podman|none");
      }
      if (!["strict", "balanced", "off"].includes(profile)) {
        throw new Error("Sandbox profile must be strict|balanced|off");
      }

      this.state = setSandboxEnabled(this.state, true, provider as never, profile as never);
      await saveState(this.projectRoot, this.state);
      await this.audit.info("sandbox.on", "Sandbox enabled", { provider, profile });
      return `Sandbox enabled: provider=${provider} profile=${profile}`;
    }

    if (action === "off") {
      this.state = setSandboxEnabled(this.state, false, "none", "off");
      await saveState(this.projectRoot, this.state);
      await this.audit.info("sandbox.off", "Sandbox disabled");
      return "Sandbox disabled.";
    }

    if (action === "run") {
      const command = args.slice(1).join(" ").trim();
      if (!command) {
        return "Usage: /sandbox run <command>";
      }

      const activePolicy = await getActivePolicy(this.projectRoot);
      const result = await runCommandWithSandbox({
        projectRoot: this.projectRoot,
        command,
        sandbox: this.state.sandbox,
        policy: activePolicy?.pack ?? null,
        execute: true,
      });

      await this.audit.info("sandbox.run", "Sandbox command executed", {
        command,
        mode: result.mode,
        blocked: result.blocked,
        exitCode: result.exitCode,
        reason: result.reason,
        warnings: result.warnings,
      });

      if (result.blocked) {
        return `Sandbox blocked command: ${result.reason}`;
      }

      if (!result.ok) {
        return `Sandbox command failed (${result.mode}): ${result.reason ?? result.stderr}`;
      }

      const output = result.stdout || "ok";
      return `Sandbox command succeeded (${result.mode}): ${output}`;
    }

    return "Usage: /sandbox on|off|status [provider] [profile] | /sandbox run <command>";
  }

  private async plugin(args: string[]): Promise<string> {
    const [action, name, version] = args;

    if (action === "list" || !action) {
      const plugins = await listPlugins(this.projectRoot);
      if (plugins.length === 0) {
        return "No plugins installed.";
      }
      return plugins
        .map((p) => `${p.name}@${p.version} enabled=${p.enabled} integrity=${(p.integrity ?? "").slice(0, 8)}`)
        .join("\n");
    }

    if (action === "install") {
      if (!name) {
        return "Usage: /plugin install <name> [version]";
      }
      const plugin = await installPlugin(this.projectRoot, name, version ?? "latest");
      const plugins = await listPlugins(this.projectRoot);
      this.state = { ...this.state, plugins };
      await saveState(this.projectRoot, this.state);
      await this.audit.info("plugin.install", "Plugin installed", plugin as unknown as Record<string, unknown>);
      return `Plugin installed: ${plugin.name}@${plugin.version}`;
    }

    if (action === "remove") {
      if (!name) {
        return "Usage: /plugin remove <name>";
      }
      const removed = await removePlugin(this.projectRoot, name);
      const plugins = await listPlugins(this.projectRoot);
      this.state = { ...this.state, plugins };
      await saveState(this.projectRoot, this.state);
      return removed ? `Plugin removed: ${name}` : `Plugin not found: ${name}`;
    }

    return "Usage: /plugin list | /plugin install <name> [version] | /plugin remove <name>";
  }

  private async auditCommand(args: string[]): Promise<string> {
    const [action, maybeDaysFlag, maybeDaysValue] = args;
    if (action !== "prune") {
      return "Usage: /audit prune [--days N]";
    }

    let days = 30;
    if (maybeDaysFlag === "--days" && maybeDaysValue) {
      days = Number.parseInt(maybeDaysValue, 10);
    }
    if (!Number.isFinite(days) || days <= 0) {
      throw new Error("--days must be a positive integer");
    }

    const removed = await this.audit.prune(days);
    await this.audit.info("audit.prune", "Audit files pruned", { days, removed });
    return `Audit prune complete. removed=${removed}`;
  }
}
