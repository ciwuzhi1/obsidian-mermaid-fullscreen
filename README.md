# Mermaid Fullscreen

给 Obsidian 里每个 Mermaid 图加上一个**左上角全屏按钮**：点击后全屏查看流程图，仍然沿用 Obsidian 自身的 Mermaid 渲染结果与主题样式（深色模式的反色规则也一并继承），并支持滚轮缩放、拖拽平移、双指缩放。

## 功能

- 每个 Mermaid 代码块左上角出现全屏按钮（按钮位置贴着图本身的左上角）
- 全屏弹窗克隆 Obsidian 已渲染好的原生 SVG，不重新解析源码，因此：
  - 字体、配色、节点样式与笔记里完全一致
  - 深色模式下自动套用 Obsidian 的 `.theme-dark .mermaid > svg` 反色规则
- 交互：
  - 滚轮以鼠标位置为中心缩放
  - 按住拖拽平移
  - 双击 / `0` 键适应窗口
  - `+` / `-` 缩放，`Esc` 关闭
  - 移动端支持双指缩放
- 底部右侧控制条：缩小、当前比例、放大、适应窗口、关闭
- 阅读视图与实时预览均生效，主题/窗口尺寸变化后按钮位置自动重算

## 安装

把以下三个文件放进 vault：

```
<你的 vault>/.obsidian/plugins/mermaid-fullscreen/
├── manifest.json
├── main.js
└── styles.css
```

然后在 `设置 → 第三方插件` 中启用 **Mermaid Fullscreen**。

## 开发

```bash
npm install
npm run dev     # 监听编译
npm run build   # 类型检查 + 生产构建
```

开发时可以直接把本目录软链或复制到 `.obsidian/plugins/mermaid-fullscreen/`，然后用 Obsidian 的 `plugin:reload` 命令重载。

## 实现要点

- `MutationObserver` 监听 `.mermaid` 节点，实时预览重渲染后自动补回按钮
- 全屏时克隆的是**已渲染的 SVG**，外层保留 `class="mermaid"`，从而继承 Obsidian 原生主题 CSS
- SVG 内联 `<style>` 以原始 `id` 为作用域，克隆时保留 id，颜色规则随克隆一起生效
- 缩放通过 `transform: translate() scale()` 实现，比例限制在 5% ~ 800%

## 已验证

- Obsidian 1.14.5（installer 1.13.7），Windows 11
- 阅读视图 / 实时预览
- 浅色主题；深色主题反色规则通过计算样式验证为 `invert(1) hue-rotate(180deg) saturate(1.25)`
