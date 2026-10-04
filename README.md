# HTML共有くん（Cloudflare版）

> [!NOTE]
> これは [minorun365/html-share](https://github.com/minorun365/html-share)（AWS版）のforkで、実行基盤をCloudflare（Workers / R2 / D1 / Access）へ置き換えたものです。CLI・スキル・使い方は本家と同じです。

HTML共有くんは、AIコーディングエージェントに作らせたHTMLを1か所へためて、スマホからも読めるようにするツールです。自分のCloudflareアカウントで動かすセルフホスト型で、作者へページや回答が送られることはありません。

<p align="center">
  <img src="docs/images/dashboard.png" alt="HTML共有くんのメインダッシュボード" width="66%">
  &nbsp;
  <img src="docs/images/mobile-approval-actions-native.png" alt="AIから届いた承認依頼をスマホで確認" width="31%">
</p>

## 主な機能

- **ためる**：エージェントが作ったHTMLを自分専用の一覧へ登録して配信する。画像やフォントは1枚に埋め込むので、リンクが切れない
- **見つける**：同じ案件のページを1枚のカードにまとめ、新着・スター・進行中の仕事で絞り込める
- **スマホで読む**：ホーム画面に追加すればアプリのように開ける。はみ出す表やカレンダーはスマホ幅に並べ直す
- **共有する**：期限付きの共有URLをその場で発行できる。社内限定のURLも選べ、SlackやTeamsに貼るとカードで表示される
- **スマホとやり取りする**：外出先で思いついた依頼を置いておいたり、PCの確認依頼にスマホから答えたりできる

## 頼み方の例

セットアップが済んだあとは、いつもどおりエージェントへ日本語で頼みます。コマンドは覚えなくてOKです。

> このHTMLを共有くんに追加して

> このページを社内限定で7日間共有して

> `/inbox` で、スマホから置いた依頼を引き取って

Claude Code、Codex、Cursorなど、手元のどのエージェントからでも同じように使えます。

## ドキュメント

- [初回セットアップ](docs/setup.md)
- [アーキテクチャ](docs/architecture.md)
- [セキュリティ設計](docs/threat-model.md)
- [進行中フィルター](docs/progress-filter.md)
- [リンクプレビュー（OGP）](docs/link-preview.md)

## ライセンス

Apache License 2.0
