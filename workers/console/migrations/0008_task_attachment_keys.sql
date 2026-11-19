-- 残存する束から添付情報を保存し、束の削除後も依頼に表示する。
ALTER TABLE tasks ADD COLUMN attachment_keys TEXT;
UPDATE tasks SET attachment_keys = (SELECT keys_json FROM upload_batches WHERE id = tasks.attachment_batch)
WHERE attachment_batch IS NOT NULL;
