# Mnemosyne — Claude Code Plugin

> Mnemosyne（记忆女神）是一个科研助手 Claude Code 插件，连接本地 Elasticsearch 实例，帮助研究者完成从文献检索、知识积累到 idea 孵化的全流程。

---

## 项目概览

### 核心目标（第 0 层）
端到端辅助科研产出，最终目标是 paper 从 0 到 1。

### 四步走（第 1 层）
| 阶段 | 状态 | 说明 |
|------|------|------|
| 1. 检索 | ✅ 当前开发重点 | 构建并维护知识数据库，支持论文/insight 的录入与检索 |
| 2. 思考 | ✅ 当前开发重点 | 基于数据库内容辅助 idea 生成与打磨 |
| 3. 实验 | ⏳ 暂缓 | 尚无成熟方案，后续规划 |
| 4. 写作 | ⏳ 暂缓 | 后续规划 |

**当前 sprint 只实现第 1、2 步。**

---

## 插件结构

```
mnemosyne/
├── .claude-plugin/
│   └── plugin.json          # 插件元数据与清单
├── commands/                # Slash 命令
│   ├── search.md            # /mnemosyne:search
│   ├── add-paper.md         # /mnemosyne:add-paper
│   ├── add-insight.md       # /mnemosyne:add-insight
│   ├── brainstorm.md        # /mnemosyne:brainstorm
│   ├── status.md            # /mnemosyne:status
│   └── reembed.md           # /mnemosyne:reembed
├── agents/                  # 专用子 Agent
│   ├── paper-ingestor.md    # PDF 解析与入库
│   ├── crawler.md           # arXiv / Semantic Scholar 爬取
│   └── idea-coach.md        # idea 打磨对话 agent
├── skills/
│   ├── elasticsearch/
│   │   └── SKILL.md         # ES 查询、mapping、embedding 操作规范
│   ├── paper-schema/
│   │   └── SKILL.md         # 论文字段标准与提取规范
│   └── insight-schema/
│       └── SKILL.md         # Insight 字段标准（已定稳）
├── hooks/
├── src/
│   ├── elasticsearch/       # 所有 ES 操作封装（禁止在其他地方裸写 ES DSL）
│   ├── embedding/           # Embedding 服务封装
│   ├── parsers/             # PDF 解析（MinerU）
│   └── crawlers/            # arXiv / Semantic Scholar API
├── embedding_model/         # 用户从 HuggingFace 下载的模型放这里（不提交 git）
├── inbox/                   # 手动放入待处理 PDF 的固定目录
│   └── processed/           # 处理完成后自动移入此处
├── .mcp.json                # MCP 服务器配置（ES 连接）
└── README.md
```

---

## 环境配置

```bash
# Elasticsearch（必须）
MNEMOSYNE_ES_URL=http://localhost:9200

# Embedding（必须）
# 用户从 HuggingFace 下载模型后放入 embedding_model/ 目录，无需配置路径
# 默认加载 embedding_model/ 下找到的第一个模型

# MinerU PDF 解析（可选，有 token 时优先用 API，否则退回本地库）
MINERU_API_TOKEN=xxx

# 外部 API（可选，不填仍可使用但有限速）
SEMANTIC_SCHOLAR_API_KEY=xxx

# 目录（可选，有默认值）
MNEMOSYNE_INBOX_DIR=./inbox                  # 默认 inbox/（相对项目根目录）
```

本地开发前确认：
1. Elasticsearch 8.x 在 `localhost:9200` 运行
2. 运行 `/mnemosyne:status` 检查连接，首次使用时自动触发 index 初始化
3. `.env` 文件已按上方模板配置

---

## 数据库设计

### Index: `papers`

```json
{
  "paper_id":               "string (内部 UUID)",
  "title":                  "string",
  "authors":                ["string"],
  "date":                   "YYYY-MM-DD",
  "venue":                  "string (e.g. NeurIPS 2024)",
  "keywords":               ["string"],
  "abstract":               "string",
  "method_description":     "string",
  "datasets":               ["string"],
  "experiment_description": "string",
  "references":             ["paper_id"],
  "cited_by":               ["paper_id"],
  "source":                 "arxiv | semantic_scholar | manual",
  "arxiv_id":               "string | null",
  "doi":                    "string | null",
  "pdf_path":               "string | null  (相对于项目根目录)",
  "embedding":              "dense_vector (dim 由模型决定，见 Embedding 章节)",
  "embedding_status":       "done | pending | failed",
  "added_at":               "datetime",
  "deleted":                "boolean (软删除，默认 false)"
}
```

**去重规则**：写入前按 `arxiv_id`（优先）或 `doi` 查重，已存在则跳过，不覆盖任何字段。

### Index: `insights`

```json
{
  "insight_id":      "string (内部 UUID)",
  "content":         "string",
  "tags":            ["string"],
  "related_papers":  ["paper_id"],
  "source_type":     "manual | reading | brainstorm",
  "maturity":        "raw | developing | solid",
  "embedding":       "dense_vector",
  "embedding_status":"done | pending | failed",
  "created_at":      "datetime",
  "updated_at":      "datetime",
  "deleted":         "boolean (软删除，默认 false)"
}
```

---

## Embedding 服务

**本地 HuggingFace 模型（用户自行下载）**

- 用户从 HuggingFace 下载任意 sentence-transformers 兼容的 embedding 模型，放入项目根目录的 `embedding_model/` 文件夹即可，无需额外配置
- 推荐模型：Qwen 系列 embedding（如 `Qwen/Qwen3-Embedding`），也支持任何 HuggingFace 上的 sentence-transformers 兼容模型
- 启动时自动扫描 `embedding_model/` 目录并加载；若目录为空或不存在则报错，并提示用户从 HuggingFace 下载模型放入该目录
- 统一封装在 `src/embedding/`（Python 侧用 `sentence-transformers` 库加载），对外只暴露 `embed(text: string): Promise<number[]>`
- Embedding 维度由实际加载的模型决定，**不可硬编码**。`/mnemosyne:status`（首次运行时）会先调用一次 embed 探测维度，再用该维度创建 ES index mapping
- 写入时 embedding 生成失败不阻断流程，标记 `embedding_status: "pending"`，后续通过 `/mnemosyne:reembed` 补跑

---

## PDF 解析

**优先级：MinerU API → MinerU Python 本地库**

```
有 MINERU_API_TOKEN
    └─→ 调用 MinerU 云端 API，返回结构化 JSON
无 token
    └─→ 调用本地 mineru Python 库（需提前安装：uv pip install mineru）
```

- 解析目标字段：title、authors、abstract、正文 sections（用于提取 method_description / experiment_description）、references 列表
- 解析结果由 `paper-ingestor` agent 二次提取与 zod 校验，再写入 ES
- 解析失败：原文件原地保留在 `inbox/`，错误追加到 `inbox/errors.log`，不中断批处理

---

## 功能模块详解

### 模块 A：添加论文

#### A1. 自动搜索（arXiv + Semantic Scholar）

```
/mnemosyne:add-paper --search
  --topic      <string>     # 必填
  --venue      <string>     # 可选，如 NeurIPS、CVPR
  --year-from  <YYYY>       # 可选
  --year-to    <YYYY>       # 可选
  --max        <number>     # 默认 20
  --dry-run                 # 预览，不写入
```

流程：arXiv API + Semantic Scholar API → 按 `arxiv_id` / `doi` 去重，已存在跳过 → 生成 embedding → `_bulk` 写入（每批 ≤ 100）

#### A2. 引用图谱扩展

```
/mnemosyne:add-paper --expand
  --papers    <id_or_title,...>          # 必填，逗号分隔
                                         # 支持：arxiv_id、paper_id（UUID）、论文标题（先在 ES 内模糊匹配确认）
  --direction references|cited-by|both  # 默认 both
  --dry-run
```

- 深度固定 **1 层**（只扩展直接引用/被引用，不递归）
- 传入标题时：先在 ES 内关键词检索确认是哪篇论文，再去 Semantic Scholar 查引用关系
- 去重规则同 A1

#### A3. inbox 批处理

**固定目录**：`inbox/`（可通过 `MNEMOSYNE_INBOX_DIR` 覆盖）

```
/mnemosyne:add-paper --from-inbox
  --dry-run    # 预览将处理哪些文件
```

流程：
1. 扫描 `inbox/` 下所有 `.pdf`（不递归子目录）
2. `paper-ingestor` agent 逐个处理：MinerU 解析 → 字段提取 → zod 校验 → embedding → 写入 ES
3. 成功：移动到 `inbox/processed/`
4. 失败：原地保留 + 写 `inbox/errors.log`

---

### 模块 B：添加 Insight

```
/mnemosyne:add-insight "<content>"
  --tags      <tag1,tag2>
  --papers    <paper_id,...>
  --maturity  raw|developing|solid   # 默认 raw
```

不带参数时进入交互式填写模式。

---

### 模块 C：检索

```
/mnemosyne:search "<query>"
  --type    papers|insights|all   # 默认 all
  --venue   <string>
  --year    <YYYY>
  --tags    <tag1,tag2>
  --limit   <number>              # 默认 10
```

**检索策略**：ES `multi_match`（关键词）+ ES `knn`（语义向量）在同一请求中合并，得分 = BM25 分 × 0.5 + kNN 相似度分 × 0.5（可后续调参）。

---

### 模块 D：Brainstorm

```
/mnemosyne:brainstorm "<topic>"
```

流程：
1. 自动调用模块 C 检索相关论文和 insights（top 20）
2. `idea-coach` agent 基于检索结果给出候选 idea
3. 多轮对话，逐步明确 motivation、novelty、可行性
4. 对话结束时询问用户是否保存为 insight
   - 确认 → 调用模块 B，`source_type: "brainstorm"`，`maturity: "developing"`
   - 跳过 → 直接结束

---

## 开发规范

### 技术栈
- **TypeScript**：插件主体（ESM、strict 模式、zod 做 schema 校验）
- **Python**：PDF 解析服务、embedding 服务（用 `uv` 管理依赖，PEP8）
- TS 与 Python 服务之间通过本地子进程或轻量 HTTP 通信

### ES 操作原则
- 所有 ES DSL 封装在 `src/elasticsearch/`，其他模块禁止直接构造查询
- 禁止删除 index 或文档，一律软删除（`deleted: true`）
- 批量写入使用 `_bulk` API，每批 ≤ 100 条

### 错误处理
- ES 连接失败：明确报错，不静默失败
- API 限流：指数退避重试，最多 3 次
- PDF 批处理失败：跳过单文件，写日志，不中断整批
- 所有批量写入操作支持 `--dry-run`

### 输出语言
跟随用户输入语言（中文输入则中文输出，英文同理）。

---

## 用户命令（Slash Commands）

所有用户操作均通过 slash command 完成，不需要接触 npm 或命令行。

| 命令 | 说明 |
|------|------|
| `/mnemosyne:add-paper --search` | 按 topic/venue/年份自动搜索并入库 |
| `/mnemosyne:add-paper --expand` | 引用图谱扩展（1层） |
| `/mnemosyne:add-paper --from-inbox` | 处理 inbox/ 下的 PDF |
| `/mnemosyne:add-insight` | 添加 insight |
| `/mnemosyne:search` | 关键词 + 语义混合检索 |
| `/mnemosyne:brainstorm` | 基于数据库的 idea 生成与打磨 |
| `/mnemosyne:status` | 检查 ES 连接、index 状态、文档数量；首次运行时自动初始化 index |
| `/mnemosyne:reembed` | 补跑所有 `embedding_status=pending` 的文档 |

---

## 开发命令（仅开发插件本身时使用）

```bash
npm run dev           # 启动开发模式
npm run build         # 构建插件
npm run test          # 运行测试
claude --plugin-dir . # 本地加载插件测试
```

---

## 当前任务优先级

1. [ ] Embedding 服务封装（Qwen，维度自动探测）
2. [ ] `/mnemosyne:status` 命令（首次运行自动初始化 index mapping）
3. [ ] MinerU 解析封装（API 优先，降级本地库）
4. [ ] `paper-ingestor` agent（PDF → 字段提取 → 写入）
5. [ ] `inbox/` 批处理命令（`--from-inbox`）
6. [ ] arXiv + Semantic Scholar 搜索入库（`--search`）
7. [ ] 引用图谱扩展（`--expand`，支持 title / id 输入）
8. [ ] 混合检索（`/mnemosyne:search`）
9. [ ] Brainstorm 对话 agent（`/mnemosyne:brainstorm`）
10. [ ] Insight CRUD（`/mnemosyne:add-insight`）

---

## 暂缓模块（不要主动开发）

- 实验设计 agent
- 论文写作 agent
- 博客内容抓取

如需讨论这些模块的设计，在对话中明确标注 `[设计讨论]`，不要直接动手实现。

---

## 参考资料

- [Claude Code Plugin 官方文档](https://github.com/anthropics/claude-code/blob/main/plugins/README.md)
- [Elasticsearch kNN Search](https://www.elastic.co/docs/solutions/search/vector/knn)
- [MinerU 文档](https://mineru.net/docs)
- [arXiv API](https://arxiv.org/help/api)
- [Semantic Scholar Graph API](https://api.semanticscholar.org/graph/v1)
- [Qwen Embedding 模型](https://huggingface.co/Qwen)
