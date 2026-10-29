---
name: lai-pptx-skill
description: 生成可编辑的 PowerPoint .pptx 文件，采用归藏电子杂志、瑞士国际主义或红灰企业汇报风格，并将逐项出现与页面切换改为 PowerPoint 原生动画。适用于文章转演示文稿、分享、产品分析和工作汇报；不用于生成单文件 HTML 网页演示。
---

# LAi 可编辑 PPTX

这是 `guizang-ppt-skill` 的原生 PPTX 改编版。来源、许可及修改说明见 [NOTICE.md](NOTICE.md)。输出使用原生文字、形状、图表和表格，不把整页截图装进 PowerPoint。

## 工作流

1. 确认内容、页数、受众及风格。用户信息足够时直接开始；只询问会改变结果的缺口。未指定风格时选择 `magazine`，企业汇报可建议 `huawei`。保留用户提供的数据、语言和品牌要求。
2. 阅读 [风格与版式](references/styles-and-layouts.md)，选择一套风格及主题，安排每页内容。当前提供 14 类原生版式，不宣称逐个复刻上游全部 HTML 版式。
3. 按 [JSON 输入格式](references/input-format.md) 创建项目 JSON，可从 `examples/minimal.json` 开始。图片放在该 JSON 所在目录或其子目录，用相对路径引用。引用来源写入每页 `sources`，解释与讲稿写入 `notes`。
4. 在技能目录安装公开依赖 `npm install --ignore-scripts`，再运行：

   ```bash
   node scripts/generate.mjs /path/to/project/deck.json /path/to/output/deck.pptx
   python3 scripts/validate_pptx.py /path/to/output/deck.pptx --expected-slides 6
   ```

   将示例路径和页数换成实际值。已有输出默认不覆盖，需改文件名或明确使用 `--force`。安装与运行仍受宿主环境权限约束，不能为绕过限制切换执行路径。
5. 验证每页内容、原生对象和动画引用，渲染后逐页查看文字溢出、字形、对比度、裁图及对齐。渲染截图通常不播放动画，不能代替 PowerPoint 放映验收。最终交付 `.pptx`；需要后续复用时同时交付 JSON 和素材。

## 不可省略的约束

- 正文、标题、数字、表格、流程标签和数据图表保持可编辑。照片、用户截图与标志作为图片插入；不要承诺图片内部像素可编辑。
- 图表使用真实数值和原生图表，禁止用任意高度的矩形冒充数据。示例数字不得冒充实际结果。
- 动画使用原生 PPTX timing 与 transition。逐项出现、淡入和点击推进用于替代可合理迁移的网页效果；持续 WebGL、悬停交互和自定义滚轮逻辑没有一一等效实现。详见输入格式中的动画配置。
- 同一演示文稿只用一套风格。企业红灰主题只保留品牌位，不自动加入 Huawei 商标，也不暗示官方授权。
- 字体不嵌入。先检查目标机器可用字体；需要时通过 `fonts` 指定替代字体并重新验排。默认 CJK 字体见 README。
- 脚本会拒绝未知字段、无效数据和明显放不下的文字。优先缩短或分页，不用极小字体掩盖内容过密。
- 不自动上传、发布、替换用户现有文件或安装到用户技能目录。根据用户明确要求执行这些额外操作。

## 验证与扩展

`npm test` 执行生成器的软件测试。编辑生成器后重跑测试；新增版式需同时更新输入校验、原生对象验证和文档。结构检查不能证明 Microsoft PowerPoint、WPS、LibreOffice 和在线查看器的播放表现完全一致。只有实际打开并检查过，才声称完成该应用内验证。
