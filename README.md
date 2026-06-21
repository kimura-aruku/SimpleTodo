# SimpleTodo

SimpleTodoは、Todo管理に集中するためのシンプルなWindows向けデスクトップアプリです。

複数のTodoリストを切り替えながら、Todoの追加、完了状態の管理、親子階層の整理を1つの画面で行えます。データは外部サービスへ送信せず、PC内にJSON形式で保存します。

## 主な機能

- 複数のTodoリストの作成、切り替え、名前変更、削除
- Todoの追加、編集、削除
- チェックボックスによる完了・未完了の切り替え
- 未完了または完了したTodoの表示絞り込み
- 子Todo・孫Todoなどの階層化
- ドラッグ操作による並び替えと階層変更
- 長いTodo本文の折り返し表示
- ローカルへの自動保存と次回起動時の復元

## 対応環境

- Windows
- Node.jsとnpm（ソースコードから実行またはビルドする場合）

## 導入方法

現時点ではインストーラーを配布していないため、ソースコードからビルドします。

1. このリポジトリをクローンします。

   ```powershell
   git clone https://github.com/kimura-aruku/SimpleTodo.git
   cd SimpleTodo
   ```

2. 依存パッケージをインストールします。

   ```powershell
   npm install
   ```

3. Windows向けアプリをビルドします。

   ```powershell
   npm run build
   ```

4. 次の実行ファイルを起動します。

   ```text
   dist/win-unpacked/SimpleTodo.exe
   ```

開発モードで起動する場合は、リポジトリのルートで次のコマンドを実行します。

```powershell
npm start
```

## 使い方

### Todoリストを管理する

- 左側のサイドバーでTodoリストを選択します。
- サイドバー上部の `+` ボタンで新しいTodoリストを作成します。
- 画面上部のリスト名を編集すると、選択中のTodoリスト名を変更できます。
- サイドバーの赤い `-` ボタンで、選択中のTodoリストを削除します。

### Todoを管理する

- 画面上部の `+` ボタンで、リスト末尾にTodoを追加します。
- Todo本文をクリックして内容を編集します。
- チェックボックスで完了・未完了を切り替えます。
- 各Todo行の赤い `-` ボタンでTodoを削除します。
- 画面上部の「未完了」「完了」で、表示するTodoを絞り込みます。

### Todoを階層化・並び替えする

- 各Todo行の `+` ボタンで、そのTodoの子Todoを追加します。
- Todo左側のドラッグハンドルをつかみ、表示されるプレビュー位置へドロップします。
- ドロップする上下位置で並び順を、横位置で親子階層を変更できます。

## データの保存先

Todoデータは次の場所に `todos.json` として保存されます。

```text
%APPDATA%\SimpleTodo\todos.json
```

通常は次のようなパスです。

```text
C:\Users\<ユーザー名>\AppData\Roaming\SimpleTodo\todos.json
```

Todoデータをバックアップする場合は、アプリを終了してからこのファイルをコピーしてください。

## 開発用コマンド

```powershell
# JavaScriptの構文確認
npm run check

# 開発モードで起動
npm start

# Windows向けビルド
npm run build
```

## 使用技術

- Electron
- HTML
- CSS
- JavaScript

## ライセンス

このソフトウェアは[MIT License](LICENSE)のもとで公開されています。

Electron、Chromiumその他の依存コンポーネントには、それぞれのライセンスが適用されます。Windows向けビルドにはElectronおよびChromiumのライセンス文書が同梱されます。
