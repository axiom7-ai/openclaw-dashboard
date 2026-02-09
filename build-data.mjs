import fs from "fs";
import path from "path";
import readline from "readline";

const SESSIONS_DIR = process.env.SESSIONS_DIR || "/Users/macos-utm/.openclaw/agents/main/sessions";
const OUT_DIR = path.resolve("./data");
const OUT_FILE = path.join(OUT_DIR, "daily.json");
const TASKS_FILE = path.join(OUT_DIR, "tasks.json");
const SURPRISE_FILE = path.join(OUT_DIR, "surprise.json");
const TZ = "Asia/Shanghai";

const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

function toDateKey(ts) {
  const d = new Date(ts);
  return dateFmt.format(d); // YYYY-MM-DD
}

function ensure(obj, key, init) {
  if (!obj[key]) obj[key] = init;
  return obj[key];
}

function shorten(text, max = 80) {
  if (!text) return "";
  const t = String(text).replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

function shortPath(p) {
  if (!p) return "";
  return String(p).replace("/Users/macos-utm", "~");
}

function summarizeToolCall(name, args = {}) {
  switch (name) {
    case "exec":
      return `exec: ${shorten(args.command || "")}`;
    case "read":
      return `read: ${shortPath(args.path || args.file_path || "")}`;
    case "write":
      return `write: ${shortPath(args.path || args.file_path || "")}`;
    case "edit":
      return `edit: ${shortPath(args.path || args.file_path || "")}`;
    case "browser":
      return `browser: ${shorten(args.action || "")}${args.targetUrl ? " " + shorten(args.targetUrl, 50) : ""}`;
    case "web_search":
      return `web_search: ${shorten(args.query || "")}`;
    case "web_fetch":
      return `web_fetch: ${shorten(args.url || "")}`;
    case "cron":
      return `cron: ${shorten(args.action || "")}`;
    case "message":
      return `message: ${shorten(args.action || "")}${args.target ? " → " + shorten(args.target, 40) : ""}`;
    default:
      return `${name}: ${shorten(JSON.stringify(args))}`;
  }
}

async function readJsonl(file, onRecord) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const obj = JSON.parse(trimmed);
      onRecord(obj);
    } catch {
      // skip
    }
  }
}

const stats = {};
const recentActions = [];

const files = fs.readdirSync(SESSIONS_DIR)
  .filter(f => f.endsWith(".jsonl"))
  .map(f => path.join(SESSIONS_DIR, f));

for (const file of files) {
  await readJsonl(file, (rec) => {
    if (rec.type !== "message") return;
    const msg = rec.message || {};
    const ts = msg.timestamp ?? rec.timestamp ?? Date.now();
    const dateKey = toDateKey(ts);
    const day = ensure(stats, dateKey, {
      date: dateKey,
      userMessages: 0,
      assistantMessages: 0,
      toolCalls: 0,
      toolUsage: {},
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      summary: "",
    });

    if (msg.role === "user") day.userMessages += 1;
    if (msg.role === "assistant") day.assistantMessages += 1;

    // tool calls
    const content = Array.isArray(msg.content) ? msg.content : [];
    for (const part of content) {
      if (part?.type === "toolCall") {
        day.toolCalls += 1;
        const name = part?.name || "unknown";
        day.toolUsage[name] = (day.toolUsage[name] || 0) + 1;

        recentActions.push({
          ts,
          tool: name,
          summary: summarizeToolCall(name, part?.arguments || {}),
        });
      }
    }

    const usage = msg.usage || rec.usage;
    if (usage) {
      day.inputTokens += usage.input || 0;
      day.outputTokens += usage.output || 0;
      day.totalTokens += usage.totalTokens || usage.total || 0;
      const cost = usage.cost;
      if (cost?.total) day.costUsd += cost.total;
    }
  });
}

let tasksByDate = {};
if (fs.existsSync(TASKS_FILE)) {
  try {
    tasksByDate = JSON.parse(fs.readFileSync(TASKS_FILE, "utf8")) || {};
  } catch {
    tasksByDate = {};
  }
}

let surpriseByDate = {};
if (fs.existsSync(SURPRISE_FILE)) {
  try {
    surpriseByDate = JSON.parse(fs.readFileSync(SURPRISE_FILE, "utf8")) || {};
  } catch {
    surpriseByDate = {};
  }
}

const rows = Object.values(stats)
  .sort((a, b) => b.date.localeCompare(a.date))
  .slice(0, 7)
  .map((r) => {
    const categories = {
      "讀取檔案": ["read"],
      "修改檔案": ["edit", "write"],
      "執行指令": ["exec", "process"],
      "查詢網頁": ["web_search", "web_fetch", "browser"],
      "排程/提醒": ["cron"],
      "發送訊息": ["message"],
      "代理管理": ["sessions_spawn", "sessions_list", "sessions_history", "sessions_send"],
      "系統/設定": ["gateway", "session_status"],
      "裝置/畫布": ["nodes", "canvas"],
    };

    const catCounts = {};
    for (const [cat, tools] of Object.entries(categories)) {
      for (const t of tools) {
        if (r.toolUsage[t]) catCounts[cat] = (catCounts[cat] || 0) + r.toolUsage[t];
      }
    }

    const actionSummary = Object.entries(catCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `${name}×${count}`)
      .join("、");

    const summaryParts = [];
    if (actionSummary) summaryParts.push(actionSummary);

    const tasks = Array.isArray(tasksByDate[r.date]) ? tasksByDate[r.date] : [];

    return {
      ...r,
      toolUsage: r.toolUsage,
      summaryCounts: catCounts,
      tasks,
      summary: summaryParts.join(" · "),
    };
  });

const recentActionsRows = recentActions
  .sort((a, b) => b.ts - a.ts)
  .slice(0, 20)
  .map((r) => ({
    time: new Intl.DateTimeFormat("zh-Hant", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(r.ts)),
    tool: r.tool,
    summary: r.summary,
  }));

const todayKey = toDateKey(Date.now());
const todaySurpriseRaw = surpriseByDate[todayKey];
const todaySurprise = Array.isArray(todaySurpriseRaw)
  ? todaySurpriseRaw
  : todaySurpriseRaw
    ? [String(todaySurpriseRaw)]
    : [];

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(
  OUT_FILE,
  JSON.stringify(
    {
      timezone: TZ,
      generatedAt: new Date().toISOString(),
      rows,
      recentActions: recentActionsRows,
      todaySurprise,
    },
    null,
    2
  )
);

console.log(`Wrote ${rows.length} day(s) to ${OUT_FILE}`);
