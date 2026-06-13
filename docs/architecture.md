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
          "parentId": null,
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
- 保存データの読み書き時に、各Todoリストが必ず1つ以上のTodoを持つよう正規化する。
- Todoの親子関係は `parentId` で表現する。`parentId: null` のTodoはルートTodoとして扱う。
- Todoの描画は保存配列から親子ツリーを組み立て、深さに応じてインデントする。
- Todoの並び替えと親子関係変更はHTML Drag and Drop APIを使い、ドロップ位置の縦方向で前後、横方向で階層を判定する。
- ドラッグ中はDOM上に挿入プレビュー行を追加し、同時に階層判定用の点線ガイドを表示する。
- ドロップ時は判定済みの挿入プレビュー情報を使って `parentId` とリスト内配列を更新して保存する。
- Todoを浅い階層へ移動する場合は、ドラッグ対象の直接の子を移動前の親へ付け替え、ドラッグ対象自身だけを移動する。
