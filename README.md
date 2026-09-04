# DX3rd 戦闘管理ボード

ダブルクロス The 3rd Edition向けの、共有可能な戦闘管理ボードです。エンゲージ、
PC・エネミー、行動値、累積ダメージ、状態・補正、図形、手番を管理できます。

同じルームIDで利用できるFS判定画面と、ココフォリア向け `/roll-table` 作成支援も
含まれています。

- 戦闘ボード: `public/board/`
- FS判定管理: `public/board/fs/`
- 操作マニュアル: `docs/MANUAL.md`
- 公開URL: https://tyamashitakss.github.io/dx3rd/

## Prerequisites

- Node.js `>=22.13.0`

## ローカル起動

```bash
npm install
npm run dev
```

起動後は `http://localhost:3000/board/` を開きます。FS判定画面は
`http://localhost:3000/board/fs/` です。

## 検証

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm run test`: build and run application tests
- `npm run lint`: run ESLint

GitHub Pagesは `public/board/` のみを公開します。共有ルームはSupabase RPCとRealtimeを
使用し、FS状態は戦闘盤面と独立して保存されます。ダイス表ライブラリは共有せず、
各端末のLocalStorageへ保存されます。
