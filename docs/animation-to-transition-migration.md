# Remar 流式渲染器：CSS Animation → Transition 迁移技术方案

> 版本：v1.0 | 日期：2026-04-23 | 状态：待架构师评审

---

## 1. 背景

Remar 是一个企业级 Markdown 流式渲染组件库（React 18/19 + TypeScript + SCSS），核心特性是字符级流式动画——每个非空白字符被包装为 `<span class="stream-char" data-ci="N">`，通过 CSS 动画逐字淡入显示。

当前动画实现采用 **CSS `@keyframes animation`** 方案，存在 GPU 合成层过多的潜在性能问题。本方案探讨迁移至 **CSS `transition`** 的可行性、技术挑战和迁移成本。

---

## 2. 架构时序分析

### 2.1 双 RAF 循环并行架构

Remar 的渲染管线由两个独立的 `requestAnimationFrame` 循环驱动，二者互不调用、并行运行：

```
┌─────────────────────────────────────────────────────────────┐
│  Frame N                                                     │
│                                                              │
│  ① CPS RAF (useSmoothStreamContent)                          │
│     ├─ EMA 自适应 CPS 计算（默认 45 字/秒）                   │
│     ├─ 从 backlog 取出 N 个字符                               │
│     └─ setDisplayedContent() ──→ 触发 React setState          │
│                                                              │
│  ② React 渲染（setState 后的同步提交）                         │
│     ├─ IncrementalRenderer → useMemo(parseBlocks)            │
│     ├─ UnifiedRenderer → StreamdownBlock                     │
│     ├─ ReactMarkdown → rehype 执行                           │
│     └─ 创建新的 <span class="stream-char"> DOM 节点           │
│                                                              │
│  ③ Animation RAF (useBlockAnimation)                         │
│     ├─ 读取 DOM 中所有 .stream-char                           │
│     ├─ 检查 grace（新字符跳过 1 帧）                          │
│     └─ classList.add('stream-char-revealed')                 │
│                                                              │
│  ④ 浏览器 Paint                                               │
│     └─ 合成所有动画进度，输出到屏幕                            │
└─────────────────────────────────────────────────────────────┘
```

**关键特性**：
- ① 和 ③ 是两个独立注册的 RAF，执行顺序由浏览器调度决定，**不确定**
- ② 由 ① 触发（setState → React re-render），但 React 18 concurrent mode 下可能延迟到下一帧
- ③ 对 ② 产生的 DOM 做直接操作（绕过 React 渲染周期）

### 2.2 当前 Animation 方案的工作原理

```scss
.stream-char {
  opacity: 0;
  animation: streamCharFadeIn 0.15s ease-out forwards;
}
.stream-char-revealed {
  opacity: 1;
  animation: none;  /* 阻止 animation 重新播放 */
}
```

```
时间线：
  T+0ms   React 渲染 → 创建 <span class="stream-char">
          → animation 立即开始（opacity: 0 → 1，持续 150ms）
  T+150ms animation 结束，span 保持 opacity: 1（forwards 填充）

  T+16ms  Animation RAF 执行 → 添加 .stream-char-revealed
          → animation: none 覆盖，确保不再重播
```

**核心特征**：动画在 **span 创建时立即开始**，不依赖 RAF。RAF 添加 `.stream-char-revealed` 的目的是"锁定"最终状态（防止 DOM 重建时 animation 重播），而非触发动画。

### 2.3 Transition 方案的工作原理（理论）

```scss
.stream-char {
  opacity: 0;
  transition: opacity 0.15s ease-out;
}
.stream-char-revealed {
  opacity: 1;
}
```

```
时间线：
  T+0ms   React 渲染 → 创建 <span class="stream-char" style="opacity:0">
          → 什么都不发生，等 RAF

  T+16ms  Animation RAF 执行 → 添加 .stream-char-revealed
          → opacity: 0 → 1，transition 触发

  T+166ms transition 结束
```

**核心差异**：transition 必须等 **RAF 添加 class** 才触发，与 RAF 耦合。

---

## 3. 问题根因分析

### 3.1 第一次尝试：纯 CSS 替换（失败）

**改动**：仅修改 CSS，将 `animation` 替换为 `transition`，零 JS 改动。

**结果**：动画极慢，延迟严重——"上面进行动画，下面又出来了"。

**根因**：RAF 的 reveal 逻辑是 **timeline 驱动** 的，不是"尽快 reveal"：

```typescript
// useBlockAnimation.ts — RAF 循环中的 reveal 判断
const easedDelay = ci * charDelay;  // charDelay = 80ms
const progress = timeline - easedDelay;
if (progress >= fadeDuration) {      // fadeDuration = 150ms
  span.classList.add('stream-char-revealed');
}
```

| 字符位置 (ci) | Animation 方案 reveal 时间 | Transition 方案 reveal 时间 |
|---|---|---|
| ci=0 | ~150ms（创建即开始） | 150ms（timeline 推进到 150ms） |
| ci=10 | ~220ms（创建后 0.15s） | 950ms（10×80 + 150） |
| ci=50 | ~1.1s（创建后 0.15s） | 4150ms（50×80 + 150） |
| ci=100 | ~2.2s（创建后 0.15s） | 8150ms（100×80 + 150） |

**Animation 方案**：每个字符的动画在 span 创建时立即开始，0.15s 后完成。RAF 添加 `.stream-char-revealed` 是多余的（animation 已结束）。

**Transition 方案**：span 创建时 opacity:0（不可见），必须等 RAF 根据 `ci × 80ms` 的 timeline 推进才添加 class 触发 transition。CPS 以 45 字/秒释放字符（每 22ms 一个），但 RAF 按 `ci × 80ms` 的节奏 reveal——**后面的字符积压越来越严重**。

这就是"上面动画很慢，下面内容又出来了"的原因：CPS 已经把新字符渲染到 DOM 了（opacity:0 不可见），但 RAF 的 timeline 还没推进到那些字符，等 timeline 终于推进到时，已积压大量字符，transition 集中触发。

### 3.2 核心矛盾

```
Animation: span 创建 = 动画开始（与 RAF 解耦）
Transition: RAF classList.add = 动画开始（与 RAF 耦合）

当前 RAF 的角色：timeline 导演（按 ci×80ms 节奏控制 reveal）
Transition 需要的 RAF 角色：尽快 reveal 执行者（span 创建后尽快添加 class）
```

**这两个角色是互斥的**。不能在不改变 RAF 逻辑的前提下，将 animation 替换为 transition。

---

## 4. 迁移方案评估

### 方案 A：纯 CSS 替换（已验证，不可行）

| 维度 | 评估 |
|------|------|
| 改动范围 | CSS only（3 处） |
| 效果 | ❌ 动画延迟严重，不可用 |
| 原因 | RAF timeline 节奏与 transition 触发机制不匹配 |

### 方案 B：CSS + RAF 逻辑重构（可行，架构级改动）

**核心思路**：将 RAF 从"timeline 导演"改为"尽快 reveal 执行者"。

#### 4.1 需要修改的模块

| 文件 | 改动内容 | 影响范围 |
|------|---------|---------|
| `index.scss` | animation → transition，删除 @keyframes | CSS 层 |
| `useBlockAnimation.ts` | 重写 RAF reveal 逻辑：去掉 ci×charDelay timeline，改为"span 创建后尽快 reveal" | **核心架构** |
| `rehypeStreamAnimated.ts` | inline style 调整（transition:none → opacity:1） | 闪烁防护 |
| `useBlockAnimation.ts` | grace 机制可能需要调整（从 1 帧改为 2 帧？） | 时序保障 |
| `useBlockAnimation.ts` | cross-block timeline continuity 逻辑需要重新设计 | block 间衔接 |
| `useBlockAnimation.ts` | settled 检测逻辑可能需要调整 | 状态管理 |

#### 4.2 RAF 逻辑重构的核心挑战

**当前逻辑**（timeline 驱动）：
```
每个字符的 reveal 时间 = ci × charDelay + fadeDuration
RAF 每帧检查：timeline 是否已推进到该字符的 reveal 时间
```

**目标逻辑**（尽快 reveal）：
```
每个字符的 reveal 时间 = span 创建时间 + grace(1-2帧) + fadeDuration
RAF 每帧检查：span 是否已存在超过 grace 期限
```

**挑战 1：失去 timeline 控制力**

当前 timeline 机制提供了以下能力：
- **字符间延迟**：`charDelay = 80ms`，字符不是同时出现而是有节奏地逐个淡入
- **跨 block 连续性**：后续 block 继承前一个 block 的 timeline 起始点
- **动态加速**：长 block 在下一个 block 开始渲染时加速

改为"尽快 reveal"后，这些能力全部丢失。所有字符会在 span 创建后几乎同时开始 transition，变成"一批字符同时淡入"而非"逐字淡入"。

**挑战 2：动画节奏由 CPS 决定，不可控**

如果 RAF 只是"尽快 reveal"，那动画节奏完全取决于 CPS 释放字符的速度（默认 45 字/秒 = 每 22ms 一个字符）。CPS 是自适应的（EMA 跟踪 SSE 速率），当 SSE 快时 CPS 快（字符密集出现），SSE 慢时 CPS 慢。这意味着：
- SSE 快 → 字符密集创建 → transition 密集触发 → 视觉上"一批字同时出现"
- SSE 慢 → 字符稀疏创建 → transition 稀疏触发 → 视觉上"一个字一个字出现"

这不是"逐字流式动画"，而是"字符出现频率的被动反映"。

**挑战 3：grace 机制的时序保障**

Transition 需要至少 2 帧间隔（创建帧 → grace 跳过帧 → reveal 帧）。当前 grace 是 1 帧。需要验证：
- CPS RAF 和 Animation RAF 的执行顺序是否稳定
- React 18 concurrent mode 是否会导致 rehype 延迟执行
- 低帧率设备（30fps、15fps）下 grace 是否仍然有效

#### 4.3 可能的折中方案

**方案 B1：保留 timeline，但缩短 charDelay**

将 `charDelay` 从 80ms 降到接近 0（如 5ms），使 RAF 几乎立即 reveal 所有字符。但这样 transition 的"逐字"效果就没了，变成"整段同时淡入"。

**方案 B2：双轨制——animation 用于 streaming，transition 用于 settled**

- Streaming 阶段：保持 animation（span 创建即开始，与 RAF 解耦）
- Settled 后：将所有 span 的 animation 替换为 transition（减少 GPU 合成层）

问题：settled 时所有 animation 已结束（forwards 填充），浏览器可能已释放合成层。这个优化的实际收益不确定。

**方案 B3：RAF 主动触发 transition（而非被动等待 timeline）**

RAF 不再按 ci×charDelay 的 timeline reveal，而是：
1. 检测新创建的 span（通过 ciCache 版本变化）
2. 按 `charDelay` 间隔主动添加 `.stream-char-revealed`
3. 用 RAF 自身的时间戳控制节奏，而非依赖 block timeline

这样 RAF 从"timeline 被动检查者"变为"主动节奏控制器"，但实现复杂度显著增加。

### 方案 C：保持 Animation，优化 GPU 合成层（低风险）

**思路**：不改变动画机制，通过其他手段减少 GPU 合成层。

| 手段 | 描述 | 预期收益 |
|------|------|---------|
| `animation-fill-mode: none` + JS 锁定 | animation 结束后移除 animation 属性，用 JS 设置 opacity:1 | 浏览器释放已完成 animation 的合成层 |
| `will-change: opacity` 仅在动画窗口 | 只对当前正在动画的几十个 span 设置 will-change | 限制合成层提升范围 |
| 完成后移除 `.stream-char` class | animation 结束后移除 class，减少选择器匹配成本 | 微优化 |

**优势**：不改变任何架构，纯 CSS/JS 微调。
**劣势**：需要验证浏览器是否真的为 `opacity` animation 创建独立合成层（Chrome 90+ 可能有批量优化）。

---

## 5. 迁移成本对比

| 维度 | 方案 A（纯 CSS） | 方案 B（CSS + RAF 重构） | 方案 C（优化 Animation） |
|------|-----------------|------------------------|------------------------|
| **可行性** | ❌ 已验证不可行 | ⚠️ 可行但架构改动大 | ✅ 低风险 |
| **改动文件数** | 1（CSS） | 3-4（CSS + TS） | 2-3（CSS + TS） |
| **改动行数** | ~10 行 | ~200-400 行 | ~50-100 行 |
| **架构影响** | 无 | **核心 RAF 循环重写** | 无 |
| **视觉效果** | ❌ 延迟严重 | ⚠️ 需要重新设计动画节奏 | ✅ 保持不变 |
| **GPU 优化** | ✅ 合成层大幅减少 | ✅ 合成层大幅减少 | ⚠️ 需验证实际效果 |
| **回归风险** | 低（但效果不可接受） | **高**（核心循环重写） | 低 |
| **测试成本** | 低 | **高**（需覆盖所有边界条件） | 低 |
| **回退难度** | 1 次 revert | 需要特性分支 + 充分测试 | 1 次 revert |

---

## 6. 已完成的优化（P0 CPU）

以下优化已实施并通过真实 SSE 数据验证，与 animation/transition 选择无关：

### 6.1 RAF ciCache（命中率 91.7%）

**文件**：`useBlockAnimation.ts`

每 block 缓存 `{ spans: HTMLElement[], cis: Int32Array, version: number }`，RAF 每帧直接读 `Int32Array` 替代 3× `parseInt(getAttribute('data-ci'))`。

- 缓存失效：rehype 每次执行递增 `container.__ciVersion`
- 安全网：`isConnected` 检查覆盖 React 18 并发中断
- Fallback：缓存未命中退回原始 querySelectorAll + parseInt

### 6.2 rehype expando（命中率 99.7%）

**文件**：`rehypeStreamAnimated.ts`

用 `container.__revealedCiSet`（Set<number>）替代每次 rehype 执行时的 `querySelectorAll('.stream-char-revealed')`。

- RAF 在每次 `classList.add('stream-char-revealed')` 时同步更新 Set
- rehype 直接读 Set（O(k) 拷贝），miss 仅发生在每个 block 首次渲染
- 首次渲染 fallback 到 DOM 扫描并 seed expando

### 6.3 验证数据

```json
{
  "rafCiCacheHit": 75045,
  "rafCiCacheMiss": 6835,
  "rafCiCacheHitRate": "91.7%",
  "rehypeExpandoHit": 5675,
  "rehypeExpandoMiss": 15,
  "rehypeExpandoHitRate": "99.7%",
  "rafTotalFrames": 8103,
  "rehypeTotalCalls": 5690
}
```

---

## 7. 辩论决策记录

### 辩题
> 「将 `.stream-char` 从 CSS animation 改为 CSS transition 驱动字符淡入动画，值得实施」

### 第一轮投票（3:2，未通过）

| 评委 | 投票 | 核心观点 |
|------|------|---------|
| 🔧 工程务实派 | ✅ | 纯 CSS 改动，revert 成本低 |
| 📐 架构质量派 | ❌ | rehype 的 `transition:none` 与 transition 方案冲突 |
| 🚀 产品价值派 | ✅ | 移动端 GPU 优化是真实痛点 |
| ⚖️ 风险控制派 | ❌ | 用户之前踩过 transition 的坑 |
| 🌍 长期演进派 | ✅ | transition 是更现代的动画模式 |

### 第二轮投票（4:1，通过）

架构质量派翻转，认为 rehype inline style 修复方案简单明确。但风险控制派维持反对——**指出 CSS 优先级问题和时序复杂性**。

### 实施后验证结果

实际实施后发现：**RAF timeline 驱动的 reveal 逻辑与 transition 触发机制存在根本性不匹配**，导致动画延迟严重。已回退。

**教训**：辩论阶段未充分考虑 RAF reveal 逻辑（ci×charDelay timeline）与 transition 耦合度的深度影响。仅从 CSS 层和 rehype 层分析是不够的，必须深入 RAF 循环的 reveal 策略。

---

## 8. 建议

### 短期（推荐）

**采用方案 C**：保持 animation 不变，通过以下手段优化 GPU：

1. **验证 GPU 合成层是否真的是问题**——用 Chrome DevTools → More Tools → Layers 面板检查实际合成层数。Chrome 90+ 对 `opacity` animation 有批量优化，可能不创建独立合成层。
2. 如果确认是问题，尝试"animation 结束后移除 animation 属性"策略。

### 中期（需架构师决策）

**如果确认需要 transition**，采用方案 B3（RAF 主动节奏控制）：

1. RAF 不再依赖 `ci × charDelay` timeline
2. 改为维护一个"待 reveal 队列"，按 `charDelay` 间隔主动出队并添加 class
3. 保留 grace 机制（至少 2 帧）
4. 重新设计 cross-block 连续性和动态加速逻辑

**预估工作量**：3-5 天（含测试）。

### 长期（架构演进）

参考 Incremark 的增量解析方案（micromark），将解析层从 O(n²) 全量重解析优化为 O(n) 增量解析。这是比 animation/transition 更大的性能杠杆（10K+ 字符文档加速 20-46x）。

---

## 附录 A：竞品动画方案对比

| 方案 | 动画层级 | 驱动技术 | DOM 开销 | GPU 影响 |
|------|---------|---------|---------|---------|
| **Remar（当前）** | 字符级 | CSS animation + RAF | 每字 1 span | 合成层多（待验证） |
| Ant Design X | 文本级 | CSS animation | 每词 1 span | 中等 |
| Incremark | AST 节点级 | React render | 可控 | 低 |
| markstream-vue | 组件级 | Vue transition | 每块 1 div | 最低 |
| LobeChat | 无 | — | 无额外 DOM | 无 |
| ChatGPT-Next-Web | 无 | — | 无额外 DOM | 无 |

## 附录 B：关键文件清单

| 文件 | 职责 | 与迁移的关系 |
|------|------|------------|
| `src/styles/index.scss` | CSS 动画定义 | animation/transition 切换点 |
| `src/core/hooks/useBlockAnimation.ts` | RAF 循环 + DOM 操作 | **核心改动点**（reveal 逻辑） |
| `src/core/rehype-plugins/rehypeStreamAnimated.ts` | 字符 span 包装 | inline style 调整 |
| `src/core/hooks/useSmoothStreamContent.ts` | CPS 缓冲 | 影响 span 创建频率 |
| `src/core/IncrementalRenderer.tsx` | 顶层编排 | 无需改动 |
| `src/react/renderers/UnifiedRenderer.tsx` | Block 渲染 | 无需改动 |
| `src/react/components/StreamdownBlock.tsx` | 单 Block 渲染 | 无需改动 |
