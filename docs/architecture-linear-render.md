# Remar 线性渲染架构 — 时序图 & 架构图

> 分支：`feature/rehype-linear-render` | 动画引擎：Web Animations API

---

## 1. 整体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         IncrementalRenderer                         │
│                                                                     │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────────┐  │
│  │  SSE Input   │───▶│ useSmoothStream  │───▶│  parseBlocks()    │  │
│  │  (raw text)  │    │  Content (CPS)   │    │  → BlockInfo[]   │  │
│  └──────────────┘    └──────────────────┘    └────────┬──────────┘  │
│                                                       │             │
│                                                       ▼             │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    UnifiedRenderer                           │   │
│  │                                                              │   │
│  │  ┌─────────────────┐    ┌─────────────────────────────────┐  │   │
│  │  │ useBlockAnimation│    │  blocks.map(renderBlock)        │  │   │
│  │  │ (lifecycle only) │    │                                 │  │   │
│  │  │ pending→done     │    │  ┌───────────────────────────┐  │  │   │
│  │  │ → settled flag   │    │  │     StreamdownBlock       │  │  │   │
│  │  └────────┬────────┘    │  │                           │  │  │   │
│  │           │ settled     │  │  ┌─────────────────────┐  │  │  │   │
│  │           ▼             │  │  │    ReactMarkdown     │  │  │  │   │
│  │    blockAnimationMeta   │  │  │                     │  │  │  │   │
│  │         (Map)           │  │  │  ┌───────────────┐  │  │  │  │   │
│  │                        │  │  │  │ rehypePlugins │  │  │  │  │   │
│  │                        │  │  │  └───────┬───────┘  │  │  │  │   │
│  │                        │  │  └──────────┼──────────┘  │  │  │   │
│  │                        │  └─────────────┼─────────────┘  │  │   │
│  └────────────────────────────────────────┼────────────────┘  │   │
│                                           │                    │   │
└───────────────────────────────────────────┼────────────────────┘   │
                                            │                        │
                                            ▼                        │
┌───────────────────────────────────────────────────────────────────┐
│                     rehypeStreamAnimated                           │
│                                                                   │
│  Input:  hast tree (from ReactMarkdown)                           │
│  Output: <span class="stream-char" data-ci="N">char</span>        │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐      │
│  │  text node: "Hello"                                     │      │
│  │    → " " (whitespace, skip)                             │      │
│  │    → <span class="stream-char" data-ci="1">H</span>    │      │
│  │    → <span class="stream-char" data-ci="2">e</span>    │      │
│  │    → <span class="stream-char" data-ci="3">l</span>    │      │
│  │    → <span class="stream-char" data-ci="4">l</span>    │      │
│  │    → <span class="stream-char" data-ci="5">o</span>    │      │
│  └─────────────────────────────────────────────────────────┘      │
│                                                                   │
│  Hard-skip: <pre>, <svg>, <script>, <style>                       │
│  Math wrap: <span class="stream-char" data-ci="N"><math>...</math></span>
└───────────────────────────────────────────┬───────────────────────┘
                                            │
                                            ▼
┌───────────────────────────────────────────────────────────────────┐
│                    StreamdownBlock (useLayoutEffect)               │
│                                                                   │
│  DOM committed (opacity:0 from CSS)                               │
│           │                                                       │
│           ▼                                                       │
│  querySelectorAll('.stream-char:not([data-animated])')            │
│           │                                                       │
│           ▼                                                       │
│  for each span:                                                   │
│    span.setAttribute('data-animated', '')                         │
│    span.animate(                                                  │
│      [{ opacity: 0 }, { opacity: 1 }],                            │
│      { duration: 150, fill: 'forwards', easing: 'ease-out' }      │
│    )                                                              │
│                                                                   │
│  Result: compositor-thread fade-in (GPU accelerated)              │
└───────────────────────────────────────────────────────────────────┘
```

---

## 2. 流式渲染时序图

```
时间轴 ─────────────────────────────────────────────────────────────▶

SSE:    ┌──"He"──┐──"ll"──┐──"o "──┐──"\n\n"──┐──"# "──┐──"Ti"──┐
             │         │        │          │         │        │
             ▼         ▼        ▼          ▼         ▼        ▼
CPS:    ┌─flush1─┐┌─flush2─┐┌─flush3─┐┌─flush4──┐┌─flush5─┐┌─flush6─┐
        │ buf→0  ││ buf→0  ││ buf→0  ││ buf→0   ││ buf→0  ││ buf→0  │
        │ τ=63ms ││ τ=63ms ││ τ=80ms ││ τ=95ms  ││ τ=80ms ││ τ=63ms │
        └────┬───┘└────┬───┘└────┬───┘└────┬────┘└────┬───┘└────┬───┘
             │         │        │          │         │        │
             ▼         ▼        ▼          ▼         ▼        ▼
React:  ┌─render─┐┌─render─┐┌─render─┐┌─render──┐┌─render─┐┌─render─┐
        │"He"    ││"Hello" ││"Hello\n││"Hello\n ││"Hello\n││"Hello\n│
        │        ││        ││"       ││\n# "    ││\n# Ti" ││\n# Ti" │
        └────┬───┘└────┬───┘└────┬───┘└────┬────┘└────┬───┘└────┬───┘
             │         │        │          │         │        │
             ▼         ▼        ▼          ▼         ▼        ▼
rehype: ┌─mark───┐┌─mark───┐┌─mark───┐┌─mark────┐┌─mark───┐┌─mark───┐
        │ H,e    ││ l,l,o  ││ (ws)   ││ (ws)    ││ #, ,T,i││ t,l,e  │
        │ ci=1,2 ││ ci=3-5 ││ ci=6   ││ ci=7-8  ││ ci=9-12││ ci=13- │
        └────┬───┘└────┬───┘└────┬───┘└────┬────┘└────┬───┘└────┬───┘
             │         │        │          │         │        │
             ▼         ▼        ▼          ▼         ▼        ▼
DOM:    ┌─commit─┐┌─commit─┐┌─commit─┐┌─commit──┐┌─commit─┐┌─commit─┐
        │ 2 spans││ 3 spans││ 1 span ││ 0 spans ││ 4 spans││ 4 spans│
        │ new    ││ new    ││ new    ││ (ws)    ││ new    ││ new    │
        └────┬───┘└────┬───┘└────┬───┘└─────────┘└────┬───┘└────┬───┘
             │         │        │                      │        │
             ▼         ▼        ▼                      ▼        ▼
WAAPI:  ┌─anim───┐┌─anim───┐┌─anim───┐              ┌─anim───┐┌─anim───┐
        │ H→fade ││ l→fade ││ (none) │              │ #→fade ││ t→fade │
        │ e→fade ││ l→fade ││        │              │ T→fade ││ l→fade │
        │ 150ms  ││ o→fade ││        │              │ i→fade ││ e→fade │
        │        ││ 150ms  ││        │              │ 150ms  ││ 150ms  │
        └────────┘└────────┘└────────┘              └────────┘└────────┘

视觉:   H e        l l o                               #   T i  t l e
        ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
        ^^^^^^^^   ^^^^^^^  ^                          ^^^^^^^^  ^^^^^^^
        flush1     flush2   flush3                     flush5    flush6
        同时淡入   同时淡入  (空格跳过)                  同时淡入  同时淡入

        ─────────────────────────────────────────────────────────────▶
                           Stagger 由 CPS flush 节奏自然产生
```

---

## 3. 组件依赖关系图

```
IncrementalRenderer
  │
  ├── useSmoothStreamContent()     ← CPS 平滑流（速率控制）
  │     ├── Adaptive τ (CV-based)  ← 动态抖动过滤
  │     └── RC Jitter Filter       ← 字符级缓冲
  │
  ├── parseBlocks()                ← Markdown 块解析
  │
  ├── useBlockAnimation()          ← Block 生命周期（仅状态管理）
  │     ├── pending → rendering → done
  │     └── settled 检测 (定时器估算)
  │
  └── AnimationProvider            ← Context 注入
        │
        └── UnifiedRenderer
              │
              ├── usePluginCache()        ← 稳定 rehype 插件实例
              │     └── rehypeStreamAnimated()
              │
              └── blocks.map → StreamdownBlock
                    │
                    ├── ReactMarkdown
                    │     └── rehypeStreamAnimated  ← span 标记
                    │
                    └── useLayoutEffect           ← WAAPI 触发
                          └── element.animate()
```

---

## 4. 数据流图

```
┌─────────┐     raw content      ┌──────────────────────┐
│  SSE    │ ──────────────────▶  │ useSmoothStreamContent│
│  Stream │                      │                      │
└─────────┘                      │  ┌─────────────────┐  │
                                 │  │  RC Buffer      │  │
                                 │  │  τ = adaptive   │  │
                                 │  │  CV = EMA       │  │
                                 │  └────────┬────────┘  │
                                 └───────────┼───────────┘
                                             │ displayedContent
                                             ▼
                                 ┌──────────────────────┐
                                 │    parseBlocks()      │
                                 │                      │
                                 │  BlockInfo[]:        │
                                 │  [{content, key,     │
                                 │    blockType, ...}]  │
                                 └──────────┬───────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
                    ▼                        ▼                        ▼
         ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
         │ useBlockAnimation │   │ UnifiedRenderer  │   │ AnimationProvider │
         │                  │   │                  │   │                  │
         │ blockTimings:    │   │ blocks.map(      │   │ blockAnimation   │
         │   Map<idx,       │   │   renderBlock)   │   │   Meta (settled) │
         │   {state,time}>  │   │                  │   │                  │
         │                  │   │  ┌────────────┐  │   │ getBlockState()  │
         │ → settled flag   │──▶│  │Streamdown  │  │   │ completeBlock()  │
         └──────────────────┘   │  │  Block     │  │   └──────────────────┘
                                │  └─────┬──────┘  │
                                │        │         │
                                │        ▼         │
                                │  ReactMarkdown   │
                                │        │         │
                                │        ▼         │
                                │  rehype plugin   │
                                │        │         │
                                │        ▼         │
                                │  <span.stream-   │
                                │   char[data-ci]> │
                                │        │         │
                                │        ▼         │
                                │  useLayoutEffect │
                                │        │         │
                                │        ▼         │
                                │  element.animate │
                                │  [{opacity:0},   │
                                │   {opacity:1}]   │
                                │  150ms, forwards │
                                └──────────────────┘
```

---

## 5. Adaptive τ 状态机

```
                    SSE 字符到达
                         │
                         ▼
              ┌─────────────────────┐
              │  计算到达间隔 Δt    │
              │  更新 EMA(Δt)       │
              │  计算 CV = σ/μ      │
              └─────────┬───────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │  CV < 0.6 ?        │
              │  (低抖动)           │
              └────┬───────────┬───┘
                   │ Yes       │ No
                   ▼           ▼
          ┌────────────┐  ┌────────────┐
          │ Passthrough │  │  Buffer    │
          │ buf = 0     │  │  mode      │
          │ 直接显示     │  │ τ = 30-120 │
          └────────────┘  │ ms 抖动过滤 │
                          └──────┬─────┘
                                 │
                                 ▼
                          ┌────────────┐
                          │ RC Buffer  │
                          │ 按τ速率释放 │
                          │ 字符到显示  │
                          └────────────┘

τ 调整公式:
  targetTau = map(CV, 0→30ms, 1.0→120ms)   // CV 越高，τ 越大
  τ = τ × 0.8 + targetTau × 0.2             // EMA 平滑，避免跳变
```

---

## 6. 关键参数

| 参数 | 值 | 位置 | 作用 |
|------|-----|------|------|
| `TAU_MIN` | 30ms | useSmoothStreamContent | 最低抖动过滤延迟 |
| `TAU_MAX` | 120ms | useSmoothStreamContent | 最高抖动过滤延迟 |
| `CV_BUFFER_THRESHOLD` | 0.6 | useSmoothStreamContent | CV 超过此值启用缓冲 |
| `RC_EMA_ALPHA` | 0.15 | useSmoothStreamContent | τ EMA 平滑系数 |
| `τ mix` | 0.8/0.2 | useSmoothStreamContent | 旧τ/新τ混合比 |
| `FADE_DURATION` | 150ms | WAAPI animate() | 字符淡入时长 |
| Settled 检测间隔 | 200ms | useBlockAnimation | setInterval 轮询 |
| `DEFAULT_CHAR_DELAY` | 80ms | useBlockAnimation | settled 时间估算系数 |
