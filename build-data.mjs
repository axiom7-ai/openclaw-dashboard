import fs from "fs";
import path from "path";
import readline from "readline";

const SESSIONS_DIR = process.env.SESSIONS_DIR || "/Users/macos-utm/.openclaw/agents/main/sessions";
const OUT_DIR = path.resolve("./data");
const OUT_FILE = path.join(OUT_DIR, "daily.json");
const TASKS_FILE = path.join(OUT_DIR, "tasks.json");
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

const rows = Object.values(stats)
  .sort((a, b) => a.date.localeCompare(b.date))
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
      tasks,
      summary: summaryParts.join(" · "),
    };
  });

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify({ timezone: TZ, generatedAt: new Date().toISOString(), rows }, null, 2));

console.log(`Wrote ${rows.length} day(s) to ${OUT_FILE}`);
