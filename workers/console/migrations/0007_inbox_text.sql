-- 既存の画像束は既定値 0 のまま扱う。
ALTER TABLE upload_batches ADD COLUMN expected_text INTEGER NOT NULL DEFAULT 0;
