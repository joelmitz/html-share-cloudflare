-- 棚の完了印と追加したテーマを本人設定として端末間で共有する。
ALTER TABLE preferences ADD COLUMN shelf_done TEXT NOT NULL DEFAULT '[]';
ALTER TABLE preferences ADD COLUMN shelf_added TEXT NOT NULL DEFAULT '[]';
