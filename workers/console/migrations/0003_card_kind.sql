-- レビューカードの種類（'' = 確認事項 / run = 承認で実行 / todo = 本人の作業の知らせ）。
ALTER TABLE tasks ADD COLUMN kind TEXT NOT NULL DEFAULT '';
