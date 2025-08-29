import React, { useEffect, useMemo, useRef, useState } from "react";

function manhattan(a: Point, b: Point) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}

function idOf(rc: { r: number; c: number }) {
  return `${rc.r},${rc.c}`;
}

// 简易并查集（用于连通分量）
class DSU {
  parent: number[];
  rank: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = Array(n).fill(0);
  }
  find(x: number): number {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }
  union(a: number, b: number) {
    let pa = this.find(a);
    let pb = this.find(b);
    if (pa === pb) return false;
    if (this.rank[pa] < this.rank[pb]) [pa, pb] = [pb, pa];
    this.parent[pb] = pa;
    if (this.rank[pa] === this.rank[pb]) this.rank[pa]++;
    return true;
  }
  countRoots(): number {
    const roots = new Set(this.parent.map((_, i) => this.find(i)));
    return roots.size;
  }
}

// GF(2) 位向量工具
function cloneVec(v: Uint8Array) { return new Uint8Array(v); }
function xorInPlace(a: Uint8Array, b: Uint8Array) { for (let i = 0; i < a.length; i++) a[i] ^= b[i]; }
function isZero(v: Uint8Array) { for (let i = 0; i < v.length; i++) if (v[i]) return false; return true; }
void isZero; // 标记为“已使用”，避免 TS6133
function leadingOneIndex(v: Uint8Array) { for (let i = v.length - 1; i >= 0; i--) if (v[i]) return i; return -1; }

// 列空间基（高斯消元）
class GF2Basis {
  basis: Map<number, Uint8Array> = new Map();
  add(vec: Uint8Array): Uint8Array | null {
    const v = cloneVec(vec);
    const keys = Array.from(this.basis.keys()).sort((a, b) => b - a);
    for (const k of keys) {
      const b = this.basis.get(k)!;
      if (v[k]) xorInPlace(v, b);
    }
    const lead = leadingOneIndex(v);
    if (lead === -1) return null;
    this.basis.set(lead, v);
    return v;
  }
  reduce(w: Uint8Array): Uint8Array {
    const v = cloneVec(w);
    const keys = Array.from(this.basis.keys()).sort((a, b) => b - a);
    for (const k of keys) {
      const b = this.basis.get(k)!;
      if (v[k]) xorInPlace(v, b);
    }
    return v;
  }
}

// 类型
type Point = { id: string; r: number; c: number };
type Edge = { id: string; u: number; v: number };
type Triangle = { id: string; a: number; b: number; c: number };

// 主组件
export default function PersistentHomologyGame() {
  const [boardN, setBoardN] = useState(9);
  const [initCount, setInitCount] = useState(9);
  const [epsilon, setEpsilon] = useState(3);
  const [targetHoles, setTargetHoles] = useState(5);

  const [showEdges, setShowEdges] = useState(true);
  const [showTriangles, setShowTriangles] = useState(true);
  const [showHoles, setShowHoles] = useState(true);

  const [mode, setMode] = useState<"add" | "remove">("add");
  const [stones, setStones] = useState<Point[]>([]);
  const [stepCount, setStepCount] = useState(0);
  const [won, setWon] = useState(false);

  const initialRef = useRef<Point[]>([]);

  useEffect(() => { resetRandom(); }, []);

  function resetRandom() {
    const pts: Point[] = [];
    const used = new Set<string>();
    let attempts = 0;
    while (pts.length < Math.min(initCount, boardN * boardN) && attempts < 5000) {
      attempts++;
      const r = Math.floor(Math.random() * boardN);
      const c = Math.floor(Math.random() * boardN);
      const id = idOf({ r, c });
      if (!used.has(id)) {
        used.add(id);
        pts.push({ id, r, c });
      }
    }
    initialRef.current = pts;
    setStones(pts);
    setStepCount(0);
    setWon(false);
  }

  function resetToInitial() {
    setStones(initialRef.current);
    setStepCount(0);
    setWon(false);
  }

  const SIZE = 640;
  const PADDING = 24;
  const cell = useMemo(() => (boardN > 1 ? (SIZE - 2 * PADDING) / (boardN - 1) : SIZE), [boardN]);
  void cell; // 避免 TS6133

  const stoneMap = useMemo(() => {
    const m = new Map<string, number>();
    stones.forEach((p, i) => m.set(idOf(p), i));
    return m;
  }, [stones]);

  function handleBoardClick(r: number, c: number) {
    const key = idOf({ r, c });
    const has = stoneMap.has(key);
    if (mode === "add") {
      if (!has) {
        setStones((prev) => [...prev, { id: key, r, c }]);
        setStepCount((s) => s + 1);
      }
    } else {
      if (has) {
        const idx = stoneMap.get(key)!;
        setStones((prev) => prev.filter((_, i) => i !== idx));
        setStepCount((s) => s + 1);
      }
    }
  }

  const complex = useMemo(() => buildComplex(stones, epsilon), [stones, epsilon]);
  const stats = useMemo(() => computeStats(complex), [complex]);
  const holeCycles = useMemo(() => computeHoleCycles(complex), [complex]);

  useEffect(() => {
    if (!won && stats.beta1 >= targetHoles && stones.length > 0) setWon(true);
  }, [stats.beta1, targetHoles, won, stones.length]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-slate-100 p-4">
      <div className="mx-auto max-w-7xl">
        {/* 标题栏 */}
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">持续同调小游戏</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode("add")}
              className={`rounded-xl px-4 py-2 text-sm font-medium shadow ${mode === "add" ? "bg-emerald-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              aria-label="添加模式"
            >
              添加棋子
            </button>
            <button
              onClick={() => setMode("remove")}
              className={`rounded-xl px-4 py-2 text-sm font-medium shadow ${mode === "remove" ? "bg-rose-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              aria-label="去除模式"
            >
              去除棋子
            </button>
            <button onClick={resetRandom} className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow hover:bg-slate-50">
              随机开局
            </button>
            <button onClick={resetToInitial} className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow hover:bg-slate-50">
              重置到初始
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)_320px]">
          {/* 左侧：参数与显示 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">参数与显示</h2>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-600">棋盘尺寸 N×N</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="range" min={5} max={19} value={boardN}
                    onChange={(e: Event) => setBoardN(parseInt((e.currentTarget as HTMLInputElement).value))}
                    className="w-full"
                  />
                  <span className="w-10 text-right text-sm tabular-nums">{boardN}</span>
                </div>
              </div>

              <div>
                <label className="text-sm text-slate-600">初始棋子数</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="range" min={0} max={Math.min(40, boardN * boardN)} value={initCount}
                    onChange={(e: Event) => setInitCount(parseInt((e.currentTarget as HTMLInputElement).value))}
                    className="w-full"
                  />
                  <span className="w-10 text-right text-sm tabular-nums">{initCount}</span>
                </div>
              </div>

              <div>
                <label className="text-sm text-slate-600">尺度 ε（曼哈顿阈值）</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="range" min={1} max={Math.max(3, Math.min(10, boardN))} value={epsilon}
                    onChange={(e: Event) => setEpsilon(parseInt((e.currentTarget as HTMLInputElement).value))}
                    className="w-full"
                  />
                  <span className="w-10 text-right text-sm tabular-nums">{epsilon}</span>
                </div>
              </div>

              <div>
                <label className="text-sm text-slate-600">目标一维洞数</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="range" min={1} max={12} value={targetHoles}
                    onChange={(e: Event) => setTargetHoles(parseInt((e.currentTarget as HTMLInputElement).value))}
                    className="w-full"
                  />
                  <span className="w-10 text-right text-sm tabular-nums">{targetHoles}</span>
                </div>
              </div>

              <div className="mt-2 space-y-2">
                <ToggleRow label="显示边" checked={showEdges} onChange={setShowEdges} />
                <ToggleRow label="显示三角面" checked={showTriangles} onChange={setShowTriangles} />
                <ToggleRow label="显示洞" checked={showHoles} onChange={setShowHoles} />
              </div>

              <div className="pt-2 text-xs text-slate-500">操作提示：点击棋盘交叉点以添加/去除棋子。</div>
            </div>
          </div>

          {/* 中间：棋盘 */}
          <div className="flex items-center justify-center">
            <Board
              N={boardN} size={SIZE} padding={PADDING}
              stones={stones}
              showEdges={showEdges}
              showTriangles={showTriangles}
              showHoles={showHoles}
              complex={complex}
              holeCycles={holeCycles}
              onClickPoint={handleBoardClick}
            />
          </div>

          {/* 右侧：统计与胜负 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">统计与状态</h2>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="步数" value={stepCount} accent="emerald" />
              <Stat label="棋子数 V" value={stones.length} accent="slate" />
              <Stat label="边数 E" value={complex.edges.length} accent="blue" />
              <Stat label="三角数 T" value={complex.triangles.length} accent="amber" />
              <Stat label="连通分量 C" value={stats.components} accent="violet" />
              <Stat label="一维洞数" value={stats.beta1} accent="rose" />
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xl leading-6 text-slate-700">
              当前规则：若达到 <span className="font-semibold">{targetHoles}</span> 个一维洞则胜利。
              {won ? (
                <div className="mt-2 rounded-lg bg-emerald-100 px-3 py-2 text-emerald-800 text-xl font-bold">🎉 胜利！共用步数：{stepCount}</div>
              ) : (
                <div className="mt-2 text-slate-500">继续操作以达成目标。</div>
              )}
            </div>
          </div>
        </div>

        {/* 注释 */}
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">注释</h2>
          <ul className="list-disc space-y-2 pl-6 text-slate-700">
            <li>使用曼哈顿距离：两点之间的距离等于它们横向格数差与纵向格数差的和。</li>
            <li>以 ε 为阈值构造 Vietoris–Rips 复形：两点间曼哈顿距离 ≤ ε 则连边，三点两两曼哈顿距离 ≤ ε 则填充三角。</li>
            <li>两个洞若相差若干个三角形，则视为同一个洞。</li>
            <li>洞被三角填充满，则该洞消失。</li>
            <li>若某个洞可以由其他洞组合产生，则不计数。</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// 统计卡片
function Stat({ label, value, accent = "slate" }: { label: string; value: number; accent?: string }) {
  const color = {
    slate: "text-slate-800 bg-slate-100",
    emerald: "text-emerald-800 bg-emerald-100",
    rose: "text-rose-800 bg-rose-100",
    blue: "text-blue-800 bg-blue-100",
    amber: "text-amber-800 bg-amber-100",
    violet: "text-violet-800 bg-violet-100",
  } as const;
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 inline-flex rounded-lg px-2 py-1 text-sm font-semibold ${color[accent as keyof typeof color]}`}>
        {value}
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 p-2 hover:bg-slate-50">
      <span className="text-sm text-slate-700">{label}</span>
      <input
        type="checkbox" className="h-5 w-5 accent-slate-700"
        checked={checked}
        onChange={(e: Event) => onChange((e.currentTarget as HTMLInputElement).checked)}
      />
    </label>
  );
}

// 棋盘
function Board({
  N, size, padding, stones, showEdges, showTriangles, showHoles, complex, holeCycles, onClickPoint,
}: {
  N: number; size: number; padding: number; stones: Point[];
  showEdges: boolean; showTriangles: boolean; showHoles: boolean;
  complex: ReturnType<typeof buildComplex>;
  holeCycles: Uint8Array[]; onClickPoint: (r: number, c: number) => void;
}) {
  const width = size, height = size;
  const cell = N > 1 ? (size - 2 * padding) / (N - 1) : size;

  function toXY(rc: { r: number; c: number }) {
    return { x: padding + rc.c * cell, y: padding + rc.r * cell };
  }

  const vIdxToPoint = complex.vertices;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="aspect-square w-full max-w-[720px] rounded-2xl border border-slate-200 bg-white shadow">
      {/* 网格 */}
      {Array.from({ length: N }).map((_, i) => {
        const x = padding + i * cell;
        const y = padding + i * cell;
        return (
          <g key={`grid-${i}`}>
            <line x1={x} y1={padding} x2={x} y2={height - padding} stroke="#CBD5E1" strokeWidth={1} />
            <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#CBD5E1" strokeWidth={1} />
          </g>
        );
      })}

      {/* 三角面 */}
      {showTriangles &&
        complex.triangles.map((t) => {
          const A = toXY(vIdxToPoint[t.a]);
          const B = toXY(vIdxToPoint[t.b]);
          const C = toXY(vIdxToPoint[t.c]);
          const points = `${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y}`;
          return <polygon key={`tri-${t.id}`} points={points} fill="#FDE68A" fillOpacity={0.4} stroke="#F59E0B" strokeOpacity={0.6} strokeWidth={1} />;
        })}

      {/* 边 */}
      {showEdges &&
        complex.edges.map((e) => {
          const U = toXY(vIdxToPoint[e.u]);
          const V = toXY(vIdxToPoint[e.v]);
          return <line key={`edge-${e.id}`} x1={U.x} y1={U.y} x2={V.x} y2={V.y} stroke="#3B82F6" strokeWidth={2} strokeOpacity={0.7} />;
        })}

      {/* 洞代表环 */}
      {showHoles &&
        holeCycles.map((vec, ci) => {
          const segs: { U: { x: number; y: number }; V: { x: number; y: number } }[] = [];
          for (let ei = 0; ei < vec.length; ei++) if (vec[ei]) {
            const e = complex.edges[ei];
            const U = toXY(vIdxToPoint[e.u]);
            const V = toXY(vIdxToPoint[e.v]);
            segs.push({ U, V });
          }
          return (
            <g key={`cycle-${ci}`}>
              {segs.map((s, si) => (
                <line key={`cycle-${ci}-${si}`} x1={s.U.x} y1={s.U.y} x2={s.V.x} y2={s.V.y}
                  stroke="#E11D48" strokeWidth={4} strokeOpacity={0.9} strokeDasharray="6 6" />
              ))}
            </g>
          );
        })}

      {/* 棋子 */}
      {stones.map((p) => {
        const { x, y } = toXY(p);
        return <circle key={`stone-${p.id}`} cx={x} cy={y} r={8} fill="#111827" />;
      })}

      {/* 点击层 */}
      {Array.from({ length: N }).map((_, r) =>
        Array.from({ length: N }).map((__, c) => {
          const { x, y } = toXY({ r, c });
          return (
            <circle key={`hit-${r}-${c}`} cx={x} cy={y} r={12} fill="transparent"
              onClick={() => onClickPoint(r, c)} className="cursor-pointer" />
          );
        })
      )}
    </svg>
  );
}

// 复形构造与统计
function buildComplex(points: Point[], epsilon: number) {
  const vertices = points.slice();
  const V = vertices.length;

  const edges: Edge[] = [];
  for (let i = 0; i < V; i++) {
    for (let j = i + 1; j < V; j++) {
      if (manhattan(vertices[i], vertices[j]) <= epsilon) {
        edges.push({ id: `${i}-${j}`, u: i, v: j });
      }
    }
  }

  const triangles: Triangle[] = [];
  for (let i = 0; i < V; i++) {
    for (let j = i + 1; j < V; j++) {
      if (manhattan(vertices[i], vertices[j]) > epsilon) continue;
      for (let k = j + 1; k < V; k++) {
        if (manhattan(vertices[i], vertices[k]) <= epsilon && manhattan(vertices[j], vertices[k]) <= epsilon) {
          triangles.push({ id: `${i}-${j}-${k}`, a: i, b: j, c: k });
        }
      }
    }
  }

  return { vertices, edges, triangles };
}

// 统计
function computeStats(complex: ReturnType<typeof buildComplex>) {
  const V = complex.vertices.length;
  const E = complex.edges.length;
  const T = complex.triangles.length;
  void E; void T; // 避免 TS6133（这里仅需要 C 与 beta1）

  const dsu = new DSU(V);
  for (const e of complex.edges) dsu.union(e.u, e.v);
  const C = V > 0 ? dsu.countRoots() : 0;

  const holeReps = computeHoleCycles(complex);
  const beta1 = holeReps.length;

  return { components: C, beta1 };
}

// 计算洞代表环
function computeHoleCycles(complex: ReturnType<typeof buildComplex>): Uint8Array[] {
  const V = complex.vertices.length;
  const E = complex.edges.length;
  const T = complex.triangles.length;
  void T; // 避免 TS6133
  if (E === 0) return [];

  const edgeIndex = new Map<string, number>();
  complex.edges.forEach((e, i) => edgeIndex.set(e.id, i));

  const adj: number[][] = Array.from({ length: V }, () => []);
  for (let i = 0; i < E; i++) {
    const e = complex.edges[i];
    adj[e.u].push(e.v);
    adj[e.v].push(e.u);
  }

  const visited = new Array(V).fill(false);
  const treeParent: (number | null)[] = new Array(V).fill(null);
  const treeAdj: number[][] = Array.from({ length: V }, () => []);
  const isTreeEdge = new Set<string>();

  function dfs(u: number) {
    visited[u] = true;
    for (const v of adj[u]) {
      if (!visited[v]) {
        treeParent[v] = u;
        isTreeEdge.add(edgeKey(u, v));
        treeAdj[u].push(v);
        treeAdj[v].push(u);
        dfs(v);
      }
    }
  }
  for (let s = 0; s < V; s++) if (!visited[s]) dfs(s);

  const fundamentalCycles: Uint8Array[] = [];
  for (const e of complex.edges) {
    if (!isTreeEdge.has(edgeKey(e.u, e.v))) {
      const pathEdges = pathEdgesInTree(e.u, e.v, treeParent, treeAdj, complex.edges, edgeIndex);
      const vec = new Uint8Array(E);
      for (const ei of pathEdges) vec[ei] ^= 1;
      vec[edgeIndex.get(edgeKey(e.u, e.v))!] ^= 1;
      fundamentalCycles.push(vec);
    }
  }

  const boundaryBasis = new GF2Basis();
  for (const t of complex.triangles) {
    const vec = new Uint8Array(E);
    vec[edgeIndex.get(edgeKey(t.a, t.b))!] = 1;
    vec[edgeIndex.get(edgeKey(t.a, t.c))!] ^= 1;
    vec[edgeIndex.get(edgeKey(t.b, t.c))!] ^= 1;
    boundaryBasis.add(vec);
  }

  const h1Basis = new GF2Basis();
  const reps: Uint8Array[] = [];
  for (const cyc of fundamentalCycles) {
    const reduced = boundaryBasis.reduce(cyc);
    const added = h1Basis.add(reduced);
    if (added) reps.push(added);
  }

  return reps;
}

function edgeKey(a: number, b: number) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function pathEdgesInTree(
  u: number,
  v: number,
  parent: (number | null)[],
  treeAdj: number[][],
  edges: Edge[],
  edgeIndex: Map<string, number>
) {
  void edges; // 避免 TS6133（本函数里没直接用到 edges）
  const prev: (number | null)[] = Array(parent.length).fill(null);
  const q: number[] = [u];
  const vis = new Array(parent.length).fill(false);
  vis[u] = true;
  while (q.length) {
    const x = q.shift()!;
    if (x === v) break;
    for (const y of treeAdj[x]) if (!vis[y]) {
      vis[y] = true;
      prev[y] = x;
      q.push(y);
    }
  }
  const pathNodes: number[] = [];
  let cur: number | null = v;
  while (cur !== null) {
    pathNodes.push(cur);
    if (cur === u) break;
    cur = prev[cur];
  }
  pathNodes.reverse();

  const eids: number[] = [];
  for (let i = 0; i + 1 < pathNodes.length; i++) {
    const a = pathNodes[i];
    const b = pathNodes[i + 1];
    const id = edgeKey(a, b);
    const idx = edgeIndex.get(id);
    if (idx != null) eids.push(idx);
  }
  return eids;
}
