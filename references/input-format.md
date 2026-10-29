# JSON 输入格式

生成器接收 UTF-8 JSON。字段名区分大小写，未知字段会报错。无注释、无尾随逗号。文件内不执行 JavaScript，也不加载远程图片。

## 顶层对象

| 字段 | 必填 | 含义 |
|---|---|---|
| `title` | 是 | 演示文稿标题/文件元数据 |
| `slides` | 是 | 1–100 个幻灯片对象，数组顺序即页序 |
| `style` | 否 | `magazine`（默认）、`swiss`、`huawei` |
| `theme` | 否 | 对应风格中的主题，省略使用该风格默认主题 |
| `author`、`subject` | 否 | 文件作者与主题元数据 |
| `brand` | 否 | 品牌文字，企业风在右上品牌位显示 |
| `footer` | 否 | 页脚文字 |
| `language` | 否 | 语言标记，默认 `zh-CN` |
| `fonts` | 否 | `heading`、`body`、`mono` 字体名覆盖 |
| `animation` | 否 | 原生动画配置，见下文 |

主题枚举：

```text
magazine: ink, indigo, forest, kraft, dune
swiss:    ikb, lemon, lime, orange
huawei:   classic-red, executive, cloud-tech
```

## 公共幻灯片字段

每页都需要 `layout` 与非空 `title`。可选 `subtitle`、`notes`、`sources`（字符串数组）。`notes` 和 `sources` 进入备注，不显示在页面正文。`eyebrow` 目前用于封面的小号说明。纯文本字段使用字符串，数值指标标签如 `"32%"` 也写成字符串；图表数据例外，必须是真正数值。

### 封面、章节、观点与结尾

```json
{"layout":"cover","title":"年度产品观察","eyebrow":"2026","subtitle":"研究分享"}
```

```json
{"layout":"section","title":"产品反馈","number":"01","subtitle":"本阶段的主要发现"}
```

```json
{"layout":"statement","title":"核心观点","body":"先明确用户问题，再决定功能范围。","attribution":"团队访谈总结"}
```

```json
{"layout":"closing","title":"讨论与下一步","body":"确认需要验证的问题，安排下一轮用户访谈。","contact":"research@example.com"}
```

### 目录与要点

`agenda` 和 `bullets` 接收 1–5 个字符串：

```json
{"layout":"bullets","title":"本轮研究范围","items":["访谈现有使用者","记录主要阻碍","验证改进方案"]}
```

### 对比与数字

```json
{"layout":"compare","title":"两种交付方式","left":{"title":"一次性项目","items":["范围相对固定","按阶段验收"]},"right":{"title":"持续产品","items":["需求持续变化","按反馈迭代"]}}
```

左右栏各 1–4 个要点。

```json
{"layout":"kpi","title":"示例指标","metrics":[{"value":"32%","label":"示例增长率","detail":"仅用于演示，不代表真实业务数据"},{"value":"18","label":"示例访谈数"}]}
```

指标为 1–3 项，每项需要 `value` 与 `label`，`detail` 可选。

### 原生图表

```json
{"layout":"chart","title":"示例季度数据","chart":{"type":"column","unit":"单位：示例值","categories":["Q1","Q2","Q3"],"series":[{"name":"方案 A","values":[12,16,21]},{"name":"方案 B","values":[10,14,18]}],"showValues":true},"notes":"所有数值仅用于演示。"}
```

- `type`：`bar`（横条）、`column`（柱形）、`line`（折线）、`doughnut`（环形）。
- `categories`：1–8 项非空字符串。
- `series`：1–3 组，每组 `name` 非空，`values` 长度必须等于分类数量；数值必须有限。
- 环形图只接受 1 组非负数据，合计必须大于 0。
- `unit` 可选，`showValues` 默认 `true`。图表数据保留在原生图表及嵌入数据中；不能用“没有数据”的装饰图替代。

### 原生表格

```json
{"layout":"table","title":"示例计划","table":{"headers":["阶段","工作","负责人"],"rows":[["准备","资料整理","产品组"],["验证","用户访谈","研究组"]],"widths":[1,2,1]}}
```

1–6 列，1–7 行正文。所有单元格使用字符串，允许空字符串；每行列数必须与表头相同。`widths` 是可选正数权重，长度与列数相同。不是绝对英寸值。内容过长会报错，请拆表或分页。

### 流程与时间线

```json
{"layout":"process","title":"研究流程","steps":[{"title":"准备","body":"整理问题与已有证据"},{"title":"访谈","body":"记录反馈与真实任务"},{"title":"验证","body":"比较方案并安排测试"}]}
```

```json
{"layout":"timeline","title":"示例时间计划","events":[{"date":"11 月","title":"准备","body":"收集材料"},{"date":"12 月","title":"验证","body":"完成用户测试"}]}
```

均为 2–4 项。流程项需要 `title`、`body`；时间线项另外需要字符串 `date`。

### 图片与图片网格

```json
{"layout":"image","title":"产品界面","image":"images/product.png","body":"这段说明仍然是可编辑文字。","caption":"图片由用户提供","fit":"contain"}
```

```json
{"layout":"image_grid","title":"两种使用场景","images":[{"path":"images/scene-a.jpg","caption":"场景 A","fit":"contain"},{"path":"images/scene-b.jpg","caption":"场景 B","fit":"contain"}]}
```

图片网格为 2–3 张。仅接受 JSON 所在目录及子目录中的 PNG/JPEG，单图最大 25 MiB。`fit` 可选 `contain`（默认，完整保留）或 `cover`（填满槽位，会裁切）。网络 URL、绝对路径、目录外路径和指向目录外的符号链接会被拒绝。图片像素内部的文字不自动变成可编辑对象。

## 原生动画配置

```json
"animation": {
  "effect": "fade",
  "transition": "fade",
  "durationMs": 400
}
```

- `effect`：`fade`（淡入）、`appear`（出现）或 `none`（关闭进入动画）。
- `transition`：`fade`（淡入换页）或 `none`（无换页效果）。
- `durationMs`：进入淡入的时长，毫秒。默认 400，接受 100–3000 的整数。它不改变原生“出现”效果的瞬时性质，也不等于换页时长。

默认淡入进入效果按点击推进，幻灯片切换使用淡入。文字、图表、形状仍是原生对象；动画不是 GIF、视频或整页图片。标题和页脚不应被误当成逐项讲解内容。

网页滚动触发在这里改为放映点击推进。持续流体/粒子背景、鼠标悬停反馈和交互地图不能直接等效为普通 PPTX 动画，保留静态内容与可解释的进入顺序。若要彻底关闭动画，两个枚举都设为 `none`。

动画时间轴写入 OOXML 后应检查目标 shape ID 存在、时间节点 ID 不重复。静态渲染通常只显示结果态，不能证明点击顺序已在 PowerPoint 中通过实际播放检查。

## 输出与错误

生成器默认保护同名文件。`--force` 只用于明确允许覆盖的输出。未知风格/主题、字段拼写、序列长度不匹配、无效数值、路径越界和明显溢出的文字均会失败，不应自动忽略错误继续交付。

运行后检查页数、文字、图表数据、表格与来源，再渲染每页查看排版。字号估算不是完整排版引擎；更换字体或使用长英文单词时尤其需要复检。
