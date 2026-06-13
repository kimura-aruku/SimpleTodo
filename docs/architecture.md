# Simple Todo 設計

## 技術選定

- Electron
- HTML / CSS / JavaScript
- 保存形式: JSON

## 構成

```text
src/
  main.js       Electronメインプロセス。ウィンドウ作成とTodo保存を担当。
  preload.js    Rendererへ安全なAPIを公開。
  index.html    アプリ画面。
  renderer.js   Todoの描画、追加、完了切替、表示フィルタを担当。
  styles.css    画面スタイル。
```

## データ保存

TodoデータはElectronの `app.getPath("userData")` 配下に `todos.json` として保存する。

## データモデル

```json
{
  "selectedListId": "UUID",
  "lists": [
    {
      "id": "UUID",
      "name": "Todoリスト名",
      "todos": [
        {
          "id": "UUID",
          "title": "Todo本文",
          "completed": false,
          "createdAt": "ISO日時"
        }
      ],
      "createdAt": "ISO日時"
    }
  ]
}
```

## 方針

- 単一画面でTodoリストの切り替え、Todoの追加・削除・完了切替・抽出を完結させる。
- レンダラープロセスから直接ファイルシステムへアクセスせず、preload経由で保存APIのみ公開する。
- 小規模な試作段階ではフロントエンドフレームワークを導入せず、依存関係を最小化する。
- 旧形式のTodo配列が保存されている場合は、起動時に単一Todoリスト形式へ移行する。
