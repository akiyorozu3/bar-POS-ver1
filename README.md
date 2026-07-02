# バーPOS

バー向けのシンプルなPOSシステムです。  
iPad のブラウザで動作し、売上データは Firebase Firestore にリアルタイム保存されます。

## 機能

- **ログイン／権限分離** — スタッフ用・オーナー用のアカウントでログイン。スタッフは売上管理・決済手数料・実入金額を閲覧不可（UI非表示＋Firestoreルールで保護）
- **メニュー管理（オーナー）** — 通常メニュー・本日限定メニューの追加／編集／削除、初期メニューの一括投入
- **注文入力** — 席ごとに注文を管理、キャスト担当を品目単位で設定
- **本日限定メニュー** — 当日限りのメニューをその場で登録
- **フリー入力** — ボトルチャージ・指名料など金額を直接入力
- **会計** — 現金/カード/QR払い対応、お釣り自動計算
- **手数料管理** — カード・QR払いの決済手数料を設定、実入金額を自動計算
- **売上管理** — 今日/今週/今月の集計、キャストバック計算
- **CSV出力** — Excel で開ける形式でダウンロード
- **リアルタイム同期** — オーナーがパソコンで同じURLを開くだけで最新売上を確認

## 技術スタック

| 項目 | 内容 |
|---|---|
| フロントエンド | React 18 + TypeScript + Vite |
| 状態管理 | Zustand |
| データベース | Firebase Firestore |
| ホスティング | Firebase Hosting（推奨） |
| 端末 | iPad Safari（PWA対応） |

## セットアップ

### 1. リポジトリをクローン

```bash
git clone git@github.com:akiyorozu3/bar-POS-ver1.git
cd bar-POS-ver1
```

### 2. 依存パッケージをインストール

```bash
npm install
```

### 3. Firebase プロジェクトを作成

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. 「プロジェクトを追加」→ 任意の名前で作成
3. 「ウェブアプリを追加」→ 設定値をコピー
4. Firestore Database を作成（本番モードでOK）
5. **Authentication を有効化** → 「ログイン方法」で「メール/パスワード」を有効にする

#### ログインアカウントを作成

Authentication → 「ユーザーを追加」から、**スタッフ用・オーナー用に1つずつ**作成します。
メールアドレス欄には `ログインID@（VITE_AUTH_ID_DOMAIN のドメイン）` を入力してください。

| 役割 | メールアドレス（例） | パスワード |
|---|---|---|
| オーナー | `owner@bar-pos.local` | 任意 |
| スタッフ | `staff@bar-pos.local` | 任意 |

※ ログイン画面では「`@bar-pos.local`」より前の **ID部分（owner / staff）だけ** を入力します。  
※ オーナー判定は `VITE_OWNER_ID`（既定 `owner`）と一致するIDです。これ以外はすべてスタッフ扱いになります。

### 4. 環境変数を設定

```bash
cp .env.example .env
```

`.env` を開き、Firebase の設定値を入れてください：

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

# ログインID→メール変換の固定ドメイン（実在しなくてよい）
VITE_AUTH_ID_DOMAIN=bar-pos.local
# オーナー扱いにするログインID（これ以外はスタッフ扱い）
VITE_OWNER_ID=owner
```

> ⚠️ `VITE_AUTH_ID_DOMAIN` / `VITE_OWNER_ID` を変更した場合は、後述の Firestore セキュリティルール内の
> `owner@bar-pos.local` も同じ値（`<VITE_OWNER_ID>@<VITE_AUTH_ID_DOMAIN>`）に書き換えてください。

### 5. 開発サーバーを起動

```bash
npm run dev
```

ブラウザで `http://localhost:5173` を開くと動作確認できます。

### 6. ビルド & デプロイ（Firebase Hosting）

```bash
# Firebase CLI をインストール（初回のみ）
npm install -g firebase-tools
firebase login

# プロジェクトを初期化（初回のみ）
firebase init hosting
# → 公開ディレクトリ: dist
# → SPA設定: yes

# ビルド & デプロイ
npm run build
firebase deploy
```

デプロイ後に発行される URL を iPad のホーム画面に追加すれば  
アプリとして使用できます（PWA）。

## 別マシンで開発する（2台目のセットアップ）

複数のパソコンで開発する場合の手順です。**コードは Git で共有できますが、`.env` は共有されません**（後述）。

```bash
# 1. クローン（この repo は akiyorozu3 アカウント）
git clone git@github.com:akiyorozu3/bar-POS-ver1.git
cd bar-POS-ver1

# 2. 依存パッケージ
npm install

# 3. デプロイもするなら Firebase CLI
npm install -g firebase-tools
firebase login
```

### ⚠ `.env` は手動でコピーする（最重要）

`.env`（本物の Firebase 鍵）は `.gitignore` 済みで、**clone しても付いてきません**。
すでに動いている端末から、`.env` を **安全な手段（AirDrop・パスワードマネージャ・USB 等）で**新しいマシンへコピーしてください。

- `.env.example` を見れば必要な項目は分かりますが、**値は各自入れる**必要があります。
- `.env.emulator`（ダミー値）は Git に含まれるので、エミュレータ開発だけならコピー不要です。

### 2台持ちの作法

- 作業を始める前に `git pull`、終わったら `git push`。これだけで衝突しにくくなります。
- 各マシンの Git 認証は、そのマシンのアカウント設定に従います（このリポジトリは `akiyorozu3` 個人アカウント想定）。

## 開発用エミュレータ（本番に触れずに開発）

`VITE_USE_EMULATOR=true`（`.env.emulator`）のとき、アプリはローカルの Firestore/Auth
エミュレータに接続します。**本番データを汚さずに開発・検証**できます（本番ビルドは接続しません）。

```bash
# 前提: Java が必要（Firestore/Auth エミュレータの実行に使用）
#   macOS 例: brew install --cask temurin

# ターミナル1: エミュレータ起動（UI: http://127.0.0.1:4000）
npm run emu

# ターミナル2: サンプルデータ投入（アカウント/メニュー/キャスト/設定）
npm run seed:emu

# ターミナル2: アプリをエミュレータ接続で起動
npm run dev:emu
```

> 通常の `npm run dev` は本番 Firestore に接続します。本番データに触れたくないときは
> `npm run dev:emu`（エミュレータ）を使ってください。パッケージ化の全体方針は
> [docs/パッケージ化設計.md](docs/パッケージ化設計.md) を参照。

## Firestore セキュリティルール

本番運用では **必ず** ルールを設定してください（未設定だとデータが第三者に丸見えになります）。  
本リポジトリの [`firestore.rules`](./firestore.rules) の内容を Firebase Console → Firestore → ルール に貼り付けます。

ポイント：

- **メニュー・手数料設定** … ログイン済みなら閲覧可、変更はオーナーのみ
- **取引（売上）** … スタッフは「会計の確定（作成）」のみ可能。**過去の売上の閲覧・修正・削除はオーナーのみ**

これにより、スタッフのアカウントでは（UIだけでなく）データベースから直接でも売上を読み取れません。

> オーナー判定はルール内の `owner@bar-pos.local` で行います。`VITE_OWNER_ID` / `VITE_AUTH_ID_DOMAIN` を
> 変更した場合は、この値も `<VITE_OWNER_ID>@<VITE_AUTH_ID_DOMAIN>` に合わせて書き換えてください。

## メニューの初期データ投入

**オーナーでログイン → 「メニュー管理」画面** を開き、メニューが空のときに表示される  
**「デフォルトメニューを投入」** ボタンを押すと、[`src/lib/defaultMenus.ts`](src/lib/defaultMenus.ts) の  
`DEFAULT_MENUS` が Firestore に一括登録されます。

その後は同じ画面から、メニューの追加・名前/価格の編集・削除がいつでも行えます。  
本日限定メニューは「メニュー管理」画面、または注文画面の「本日メニュー編集」から登録できます。

## ディレクトリ構成

```
src/
├── components/
│   ├── LoginScreen.tsx     # ログイン画面
│   ├── OrderScreen.tsx     # 注文入力画面
│   ├── CheckoutScreen.tsx  # 会計画面
│   ├── SalesScreen.tsx     # 売上管理画面（オーナー）
│   ├── MenuManageScreen.tsx# メニュー管理画面（オーナー）
│   └── CastManageScreen.tsx# キャスト管理画面（オーナー）
├── hooks/
│   └── useSalesSummary.ts  # 売上集計ロジック
├── lib/
│   ├── firebase.ts         # Firebase 初期化（Firestore + Auth）
│   ├── authConfig.ts       # ログインID↔メール変換・ロール判定
│   ├── tax.ts              # 税計算ユーティリティ
│   ├── csv.ts              # CSV出力
│   └── defaultMenus.ts     # デフォルトメニュー定義
├── store/
│   └── posStore.ts         # Zustand グローバル状態
├── styles/
│   └── global.css          # スタイル
├── types/
│   └── index.ts            # 型定義
├── App.tsx                 # ルートコンポーネント
└── main.tsx                # エントリーポイント
```

## キャストの変更

**オーナーでログイン → 「キャスト管理」画面** から、キャストの追加・名前変更・削除が行えます。  
初回はキャストが空のときに表示される「初期キャストを投入」ボタンで、既定のキャスト  
（[`src/store/posStore.ts`](src/store/posStore.ts) の `DEFAULT_CASTS`）を一括登録できます。

- キャストを削除しても、過去の売上・バック集計には影響しません（記録された担当名はそのまま残ります）
- 名前を変更した場合、変更後の注文から新しい名前が使われます

## バック率の変更

**オーナーでログイン → 「売上管理」画面 → 「手数料/バック」ボタン** を開くと、  
カード/QR手数料と一緒に **キャストバック率（%）** を画面から設定・保存できます（Firestoreに保存）。

優先順位は次のとおりです：

1. 画面で保存した値（Firestore `settings/back`）— 最優先
2. `.env` の `VITE_BACK_RATE`（例 `0.30` = 30%）— 画面で未保存のときの初期値
3. `src/store/posStore.ts` の `BACK_RATE` 既定値（0.30）
