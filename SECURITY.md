# Security Policy

## Reporting a vulnerability

セキュリティ上の問題を見つけた場合、認証情報、共有URL、個人情報、再現用の実データは公開Issueに書かないでください。

GitHubのSecurity Advisoriesから非公開で報告してください。

https://github.com/joelmitz/html-share-cloudflare/security/advisories/new

受領から7日以内に一次回答し、影響範囲と修正方針を連絡します。修正が公開されるまで、脆弱性の詳細を公開するのは控えてください。

## Supported versions

正式リリース後は、最新のマイナーバージョンだけをサポートします。`0.x` は公開前の評価版として扱います。

## Deployment responsibility

HTML共有くんはセルフホスト型です。Cloudflareアカウント、ドメイン、認証ユーザー、配信するコンテンツ、共有URLは各利用者が管理します。

本番用の依存関係は `npm run audit:prod` で検査します。Wranglerはローカルでのデプロイに使い、開発用の依存関係として分けています。
