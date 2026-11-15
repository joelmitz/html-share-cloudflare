-- 非公開の画像束。画像本体は専用R2バケットに保存する。
CREATE TABLE upload_batches (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('uploading', 'ready')),
  expected_count INTEGER NOT NULL,
  keys_json TEXT NOT NULL DEFAULT '[]',
  task_id TEXT,
  is_attachment INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX upload_batches_expiry ON upload_batches (expires_at);
ALTER TABLE tasks ADD COLUMN attachment_batch TEXT;
