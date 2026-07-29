# JamCapture

面向职业乐手的本地优先音乐灵感工作台。应用使用 React、TypeScript、TailwindCSS 和 IndexedDB，支持浏览器录音、灵感整理、全局播放与 AI 延伸模拟流程。

## 开发

```bash
npm install
npm run dev
```

## 质量检查

```bash
npm run lint
npm test
npm run build
```

录音需要浏览器授予麦克风权限。所有录音和编辑结果默认仅保存在当前浏览器的 IndexedDB 中；AI 生成目前为本地模拟，不会上传音频。
