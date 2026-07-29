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

## Mureka 音频理解

在项目根目录的 `config.yaml` 中填写 API Key：

```yaml
api_key: "YOUR_MUREKA_API_KEY"
```

该文件已被 Git 忽略，并由本地服务器阻止浏览器直接访问。灵感音频会通过同仓代理发送至 Mureka `/v1/song/describe`；接口支持不超过 10MB 的 MP3/M4A 音频。浏览器产生 WebM 录音时，应用会先在本地解码并转换为 MP3，再提交分析。修改 Key 后无需重启服务，可在失败条目上点击“重试分析”。
