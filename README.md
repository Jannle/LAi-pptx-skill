# LAi PPTX Skill

把归藏 HTML 演示技能改编为 **可编辑 `.pptx` 生成技能**：三套视觉风格、12 套主题、14 类版式，以及 PowerPoint 原生进入动画和页面切换。不是网页截图转 PPT。

## 安装

需要：

- Node.js 20 或更新版本。
- Python 3，用于标准库实现的 PPTX 包结构验证。
- 首次安装依赖需要访问 npm 官方注册表。运行生成器不需要网络，也不需要私有 API、API Key 或浏览器。
- 目标机器最好安装 `Noto Sans CJK SC`、`Noto Serif CJK SC`、`Noto Sans Mono CJK SC`。字体不随包分发、不自动下载、不嵌入 PPTX。

解压后将整个 `lai-pptx-skill` 文件夹放入你的 Agent 技能目录。例如：

- Claude Code：`~/.claude/skills/lai-pptx-skill/`
- Codex：`~/.codex/skills/lai-pptx-skill/`（设置了 `CODEX_HOME` 时使用该目录下的 `skills/`），或宿主当前支持的自定义技能位置。
- 其他 Agent：使用其支持的 skill 导入/目录方式，并让其读取 `SKILL.md`。

**请使用独立的 `lai-pptx-skill/` 目录；不要覆盖原版 `guizang-ppt-skill/` 或旧改编版 `guizang-pptx-skill/`。** 从 GitHub 下载源码时，先将解压出的根目录改名为 `lai-pptx-skill`，再按上述路径安装。

以上是手动安装说明，本包不会自行改写你的技能目录。宿主需要具备文件读写与命令执行能力；普通纯聊天界面不能直接运行它。

在解压出的技能目录中执行：

```bash
npm install --ignore-scripts
```

公开依赖固定为 PptxGenJS 4.0.1 和 JSZip 3.10.1。不要复制开发机器的 `node_modules`，请在目标机器正常安装。

## 直接使用

```bash
node scripts/generate.mjs examples/minimal.json output/my-deck.pptx
python3 scripts/validate_pptx.py output/my-deck.pptx --expected-slides 3 --input-json examples/minimal.json --require-animation
npm test
```

验证命令中的页数应与 JSON 的 `slides` 长度一致。Windows 可将 `python3` 换成 `python` 或 `py -3`。若输出已存在，换一个文件名；明确要覆盖时才增加 `--force`。

也可以对 Agent 说：

> 用 lai-pptx-skill 将这份文章做成 8 页瑞士风 PPTX，文字和图表可编辑，正文按点击逐项淡入。数据只使用我提供的附件，不添加虚构指标。

编辑内容时优先修改 JSON 后重新生成。若已在 PowerPoint 中手工修改，重新生成不会自动合并那些改动，请另存新文件。

## 可编辑范围

| 内容 | PPTX 中的实现 |
|---|---|
| 标题、正文、页码、数字、注释 | 原生文本框 |
| 线条、流程箭头、几何区块 | 原生形状 |
| 条形图、柱形图、折线图、环形图 | 原生图表及嵌入数据 |
| 数据表格 | 原生表格 |
| 照片、截图 | 原生图片对象，可移动、缩放、裁剪；不把像素转成文字或形状 |
| 逐项进入与换页 | 原生 OOXML 动画时间轴与幻灯片切换 |

图片默认保真放入槽位（`contain`），只有明确选 `cover` 才裁切。所有图片必须是 JSON 所在目录内的 PNG/JPEG 文件，不能使用远程 URL、绝对路径或跳出项目目录的路径。

## 风格与动画

- `magazine`：电子杂志/电子墨水，衬线标题、留白、细线与暖纸色。
- `swiss`：瑞士国际主义，左对齐、强字号对比、单一高饱和强调色。
- `huawei`：红灰企业汇报，白灰底、红色强调、右上品牌位。它是风格名称，不代表 Huawei 官方模板或授权。

默认采用淡入/点击推进与淡入换页，可通过 `animation` 配置改为出现或关闭。详见 [输入格式](references/input-format.md)。网页中的逐项入场、滚动触发可改成点击序列；WebGL 流体、ASCII 背景、悬停、地图拖拽、ESC 索引和 B 低功耗快捷键不保留其网页运行逻辑，必要内容改为静态排版与原生放映导航。**不承诺动画与网页效果逐像素等效。**

渲染图片或 PDF 不展示完整点击过程。正式使用前请在目标版本的 PowerPoint 中开启放映，逐页检查进入顺序和换页；WPS、LibreOffice 和网页查看器可能简化或忽略部分效果。只有包结构验证，不等于已在这些应用中完成播放验收。

## 文件导航

- `SKILL.md`：Agent 入口与操作边界。
- `scripts/generate.mjs`：原生 PPTX 生成器。
- `scripts/animate-pptx.mjs`：原生 OOXML 动画辅助实现。
- `scripts/validate_pptx.py`：PPTX 结构、可编辑对象与动画检查。
- `scripts/smoke-test.mjs`：软件烟测。
- `references/input-format.md`：字段、约束和示例。
- `references/styles-and-layouts.md`、`references/themes.json`：设计规则与主题令牌。
- `examples/`：可修改输入模板及测试/示例文件。
- `LICENSE`、`NOTICE.md`：AGPL-3.0 许可、原项目署名与改编说明。

## 随包示例与验证记录

`examples/demo-magazine.pptx`、`demo-swiss.pptx`、`demo-huawei.pptx` 是同一组内容的 8 页软件验收示例，包含原生动画、图表和表格。数据明确标为虚构测试数据。修改 `examples/demo.json` 的 `style` 可复现相应风格。

v1.0.0 在 2026-10-29 以已安装的上述版本依赖完成 24 份文件、84 页的生成/结构测试，以及 14 个拒绝无效输入或保护已有文件的用例。三份随包示例已通过 LibreOffice 静态渲染和逐页排版检查。记录见 `examples/TEST-RESULTS.json`。还完成了独立目录的复用测试；**未在全新机器执行 npm 安装，也未在 Microsoft PowerPoint 中实播动画**，请按目标环境再次验收。

v1.0.1 仅将本改编版重命名为 `lai-pptx-skill`，生成器、动画实现、依赖与示例内容未改动。原项目名称、原作者署名、版权声明、来源链接和 AGPL-3.0 许可完整保留。

## 已知边界

本版是重写输出引擎的核心版式改编，不是任意 HTML 自动转换器，也没有逐个实现上游全部 74 个锁定版式。新增复杂组织图、地图、甘特图等应扩展原生对象实现，不能悄悄用整页图片替代。

字体替换会改变换行。脚本的文字容量估算只是保护措施，不能替代逐页视觉检查。项目的来源和版权见 [NOTICE.md](NOTICE.md)，公开依赖保留各自许可。
