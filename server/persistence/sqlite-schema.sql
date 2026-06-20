PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS decision_rooms (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'zh')),
  mode TEXT NOT NULL CHECK (mode IN ('fast', 'deep', 'red_team')),
  provider_mode TEXT NOT NULL CHECK (provider_mode IN ('demo', 'live')),
  selected_proposal_id TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  quorum_score REAL NOT NULL,
  dissent_index REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS decision_traces (
  room_id TEXT PRIMARY KEY REFERENCES decision_rooms(id) ON DELETE CASCADE,
  result_json TEXT NOT NULL,
  provider_trace_json TEXT NOT NULL,
  live_verdict_json TEXT,
  prompt_bundle_json TEXT NOT NULL,
  adr_markdown TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reputation_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT REFERENCES decision_rooms(id) ON DELETE SET NULL,
  agent_id TEXT NOT NULL CHECK (agent_id IN ('gpt', 'deepseek', 'gemini')),
  domain TEXT NOT NULL CHECK (
    domain IN ('technical_architecture', 'product_strategy', 'career_strategy', 'portfolio_packaging')
  ),
  outcome TEXT NOT NULL CHECK (outcome IN ('helpful', 'neutral', 'unhelpful')),
  confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_decision_rooms_created_at ON decision_rooms(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reputation_feedback_agent_domain ON reputation_feedback(agent_id, domain, created_at DESC);

CREATE TABLE IF NOT EXISTS langgraph_checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  checkpoint_data TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (thread_id, checkpoint_id)
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_thread ON langgraph_checkpoints(thread_id, created_at DESC);

CREATE TABLE IF NOT EXISTS langgraph_writes (
  thread_id TEXT NOT NULL,
  checkpoint_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  channel TEXT NOT NULL,
  value_json TEXT NOT NULL,
  PRIMARY KEY (thread_id, checkpoint_id, task_id, idx)
);
