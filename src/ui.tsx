import { useMemo, useState } from 'react'
import { LAYERS, NERVES, PRESETS, STRUCTURE_INDEX, nerveFocusPoint, nerveTipPoint, type LayerId } from './data/anatomy'
import { MUSCLE_MESH_NAME, MUSCLE_PENDING } from './data/muscleMeshes'
import { groupLabelOf, legendOf } from './data/muscleGroups'
import {
  innervationOf,
  isTrunkId,
  rowsOfNerve,
  zonesOfNerve,
  zonesOfTrunk,
  type InnervationRef,
} from './data/innervation'
import { isNerveId, relatedOf, trunkOfNerve } from './data/links'
import { HAND_MERIDIANS, acupointOf, layersOf, type Acupoint } from './data/acupoints'
import { NERVE_GROUPS, nerveKin, type NerveGroupId } from './data/nerves'
import { describePeel, expandableLayers, planPeel } from './data/peel'
import { useAtlas } from './store'

/**
 * 数据表里的说明文字用 `**…**` 标重点。
 *
 * 那些 note 是**纯字符串**，直接塞进 JSX 会把星号原样显示出来 —— 全仓几十条 note
 * 都这么写。在渲染处统一转一次，比去改几十条数据可靠（改数据总会漏几条，
 * 而漏掉的那几条只表现为多两个星号，谁也不会特意去报）。
 */
function RichText({ text }: { text: string }) {
  const parts = text.split('**')
  if (parts.length === 1) return <>{text}</>
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <span key={i}>{p}</span>))}
    </>
  )
}

/** 神经分群在面板里的展示顺序：从中枢侧往外，近端干 → 三大系 → 皮神经 */
const NERVE_GROUP_ORDER: NerveGroupId[] = ['proximal', 'median', 'ulnar', 'radial', 'cutaneous']

/**
 * 搜索结果前面那个小圆点的颜色。
 *
 * 神经用**它的解剖群色**，不用图层的琥珀 —— 否则搜出「尺神经」与「正中神经」
 * 前面是同一个点，而画面上它们是两种颜色，读起来像对不上。
 * 其余图层仍用图层色。
 */
function dotColorOf(r: { id: string; layer: LayerId }) {
  if (r.layer === 'nerve') {
    const g = NERVES.find((n) => n.id === r.id)?.group
    if (g) return NERVE_GROUPS[g].color
  }
  return LAYERS[r.layer].color
}

/**
 * 图层显示顺序。
 *
 * 穴位排在最前并在面板里默认关闭：它是**标注层**，性质与骨／肌／神三层不同——
 * 那三层是解剖实体，穴位是贴在体表的位置标记。
 */
/*
 * 图层顺序 = 由外到里的解剖顺序，与剥离序列同向。体表排第一不只是美观：
 * 用户在这里读到的次序，就是他待会儿在画面上剥开的次序。
 */
const ORDER: LayerId[] = ['skin', 'specimen', 'acupoint', 'bone', 'muscle', 'nerve']

const TRUNK_ZH: Record<string, string> = {
  median: '正中神经',
  ulnar: '尺神经',
  radial: '桡神经',
}

/** 可展开的大层 id（子层数 > 1 才值得展开） */
const EXPANDABLE = expandableLayers()

interface PeelRow {
  kind: 'group' | 'step'
  key: string
  /** 可剥离步骤的序号（1-based）；group 行无意义 */
  depth: number
  zh: string
  count: number
  /** 能展开成子层 */
  expandable: boolean
  /** 大层 id，用于判断展开状态 */
  layer: string
}

/**
 * 逐层剥离面板。
 *
 * 剥离顺序本身就编码了解剖信息，所以面板不做成滑块——滑块表达不出
 * 「剥掉的是哪一层、露出的是什么」。这里按顺序列出每一层，
 * 点哪一层就剥到哪一层，再点一次退回上一层。
 */
function PeelControl() {
  const s = useAtlas()
  const expandedKey = s.peelExpanded.join('|')
  const plan = useMemo(() => planPeel(new Set(s.peelExpanded)), [expandedKey])
  const total = plan.steps.length
  const info = describePeel(plan, s.peelDepth)

  const rows = useMemo<PeelRow[]>(() => {
    const out: PeelRow[] = []
    const steps = plan.steps
    let i = 0
    while (i < steps.length) {
      const st = steps[i]
      if (st.parent === null) {
        out.push({
          kind: 'step',
          key: st.key,
          depth: i + 1,
          zh: st.zh,
          count: st.count,
          expandable: EXPANDABLE.includes(st.key),
          layer: st.key,
        })
        i++
        continue
      }
      // 展开态：属于同一大层的子步骤是连续的，收成一组并在前面补一个分组标题。
      // 注意大层本身此时已不在表里，不能再指望「父层行 + 子层行」的结构。
      const parent = st.parent
      let j = i
      let count = 0
      while (j < steps.length && steps[j].parent === parent) {
        count += steps[j].count
        j++
      }
      out.push({
        kind: 'group',
        key: parent,
        depth: 0,
        zh: st.groupZh,
        count,
        expandable: true,
        layer: parent,
      })
      for (let k = i; k < j; k++) {
        out.push({
          kind: 'step',
          key: steps[k].key,
          depth: k + 1,
          zh: steps[k].zh,
          count: steps[k].count,
          expandable: false,
          layer: parent,
        })
      }
      i = j
    }
    return out
  }, [plan])

  return (
    <>
      <div className="peelhead">
        <div className="sub" style={{ margin: 0 }}>
          逐层剥离
        </div>
        <div className="peelacts">
          <button className="mini" onClick={() => s.setPeelDepth(0)}>
            复原
          </button>
          <button className="mini" onClick={() => s.setPeelDepth(total)}>
            剥到骨
          </button>
        </div>
      </div>

      <div className="peelwrap">
        {rows.map((r) => {
          if (r.kind === 'group') {
            return (
              <div className="peelgroup" key={r.key}>
                <span>
                  {r.zh}
                  <em>{r.count}</em>
                </span>
                <button className="mini" onClick={() => s.togglePeelExpand(r.key)}>
                  收起
                </button>
              </div>
            )
          }
          const done = s.peelDepth >= r.depth
          return (
            <div className={done ? 'peelrow done' : 'peelrow'} key={r.key}>
              <button
                className="peelmain"
                title={done ? '再点一次退回上一层' : '剥到这一层'}
                onClick={() => s.setPeelDepth(s.peelDepth === r.depth ? r.depth - 1 : r.depth)}
              >
                <em>{r.depth}</em>
                <span>{r.zh}</span>
                <b>{r.count}</b>
              </button>
              {r.expandable && (
                <button
                  className="peelrow exp"
                  title="展开成子层，可单独剥掌侧或背侧"
                  onClick={() => s.togglePeelExpand(r.layer)}
                >
                  展开
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="peelnote">
        {s.peelDepth === 0
          ? '尚未剥离 · 全部结构可见'
          : `${
              s.peelDepth === 1 ? `已剥去 ${info.done?.zh}` : `已剥去 ${s.peelDepth} 层`
            } · ${info.exposed ? `当前露出 ${info.exposed.zh}` : '只剩骨骼'}`}
      </div>
    </>
  )
}

/**
 * 模型里实际渲染出的肌肉 mesh 列表。
 * 同一结构可能对应多个 mesh（如屈肌浅层被拆成肱头／尺头、指浅屈肌分两个头），
 * 这里按 mesh 展开，图例计数才与画面里能数出来的块数一致。
 */
const PRESENT_MUSCLES: string[] = (() => {
  const arr: string[] = []
  for (const [id, names] of Object.entries(MUSCLE_MESH_NAME)) {
    for (let i = 0; i < names.length; i++) arr.push(id)
  }
  return arr
})()

export function ControlPanel({
  clipRange,
}: {
  clipRange: [number, number]
}) {
  const s = useAtlas()
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'layer' | 'list'>('layer')

  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return []
    return [...STRUCTURE_INDEX.values()]
      .filter(
        (x) =>
          x.zh.toLowerCase().includes(t) ||
          x.en.toLowerCase().includes(t) ||
          x.la.toLowerCase().includes(t)
      )
      .slice(0, 40)
  }, [q])

  const legend = useMemo(() => legendOf(s.colorMode, PRESENT_MUSCLES), [s.colorMode])

  return (
    <div className="panel">
      <div className="brand">
        <b>左前臂 · 手</b>
        <span>神经 / 肌肉 / 骨骼 分层图谱</span>
      </div>

      <div className="tabs">
        <button className={tab === 'layer' ? 'on' : ''} onClick={() => setTab('layer')}>
          系统
        </button>
        <button className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>
          结构
        </button>
      </div>

      {tab === 'layer' ? (
        <>
          {ORDER.map((id) => {
            const st = s.layers[id]
            return (
              <div key={id}>
                <div className="row">
                  <label className="sw">
                    <input
                      type="checkbox"
                      checked={st.visible}
                      onChange={() => s.toggleLayer(id)}
                    />
                    <i style={{ background: LAYERS[id].color }} />
                    <span>{LAYERS[id].zh}</span>
                  </label>
                  <input
                    className="sl"
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={st.opacity}
                    onChange={(e) => s.setOpacity(id, parseFloat(e.target.value))}
                  />
                  <em>{Math.round(st.opacity * 100)}%</em>
                </div>
                {/*
                  体表这一层必须当场说明它是**算出来的** —— 它长得和真正的皮肤一样，
                  不说清楚就会被当成实测外形，进而被用来估围度、judge 胖瘦。
                  「由骨与肌轮廓外扩 3.5mm」这句话就是全部真相，不藏着。
                */}
                {id === 'skin' && (
                  <div className="hint skinhint">
                    由本模型的骨与肌轮廓<b>等距外扩 3.5 mm</b> 算出的闭合壳，
                    <b>不是实测外形</b>：全库没有皮肤几何（Z-Anatomy 分层里不含皮肤系统，
                    标本的体表只到腕且是平摊的另一只手）。手背处接近真实，手掌与指腹应更厚、
                    上臂这一段本模型无肌肉故偏细。可用来判断结构在不在身体之内，
                    不可用来量围度或皮下厚度。透明度低于 50% 时它不会挡住里面的结构，
                    点选、悬停都照常；推过半则成为实心外壳，鼠标只会打到它。
                  </div>
                )}
                {/*
                  穴位是体表定位，剥离会把体表这个参照系破坏掉（标记会飘在被剥走的
                  组织原来占的位置上）。这里必须说明它为什么没出现，否则用户会以为开关坏了。
                */}
                {id === 'acupoint' && (
                  <div className="hint acuhint">
                    {s.peelDepth > 0
                      ? '剥离状态下穴位已暂时隐藏（体表参照系已不成立），复原后自动显示。'
                      : '体表定位层：默认关闭，点开显示手部经穴与经脉循行；选中穴位可看进针层次。'}
                  </div>
                )}
                {/*
                  标本要讲清楚「它为什么不在手上」：它不是叠在模型手上的第二个图层，
                  而是摆在旁边的另一只手。不说明的话，用户会以为它没对齐/放歪了。
                */}
                {id === 'specimen' && (
                  <div className="hint spechint">
                    真人断层标本（DiceCT）重建，摆在模型手旁边供对照，<b>不与本模型配准</b>
                    ——两者不是同一只手。打开后可点选其中的神经与肌肉，看真实形态与示意几何差多少。
                  </div>
                )}
              </div>
            )
          })}

          <div className="sep" />

          <div className="sub">肌肉着色</div>
          <div className="mode">
            <button
              className={s.colorMode === 'func' ? 'on' : ''}
              onClick={() => s.setColorMode('func')}
            >
              功能群
            </button>
            <button
              className={s.colorMode === 'nerve' ? 'on' : ''}
              onClick={() => s.setColorMode('nerve')}
            >
              神经支配
            </button>
          </div>
          <div className="legend">
            {legend.map(({ key, style, count }) => (
              <button
                key={key}
                className={s.highlightGroup === key ? 'lg on' : 'lg'}
                title={`${style.en} — 点击高亮该群`}
                onClick={() => s.toggleHighlightGroup(key)}
              >
                <i
                  className="ramp"
                  style={{ background: `linear-gradient(90deg, ${style.ramp.join(', ')})` }}
                />
                <span>{style.zh}</span>
                <em>{count}</em>
              </button>
            ))}
          </div>
          <div className="hint">
            色块左浅右深 = 组内色阶。同群相邻肌肉轮流取不同级，放大后才分得清边界；
            点色块可单独高亮该群，再点取消。
          </div>

          <div className="sep" />

          <label className="sw">
            <input
              type="checkbox"
              checked={s.isolate}
              onChange={(e) => s.setIsolate(e.target.checked)}
            />
            <span>孤立模式（选中一项，其余淡出）</span>
          </label>

          <div className="sep" />

          <PeelControl />

          <div className="sep" />

          <div className="row clip">
            <label className="sw">
              <input
                type="checkbox"
                checked={s.clip.enabled}
                onChange={(e) => s.setClip({ enabled: e.target.checked })}
              />
              <span>剖切面</span>
            </label>
            <input
              className="sl"
              type="range"
              min={clipRange[0]}
              max={clipRange[1]}
              step={0.01}
              value={s.clip.value}
              onChange={(e) => s.setClip({ value: parseFloat(e.target.value) })}
            />
            <button className="mini" onClick={() => s.setClip({ flip: !s.clip.flip })}>
              {s.clip.flip ? '反向' : '正向'}
            </button>
          </div>

          <div className="sep" />

          <div className="sub">临床情景</div>
          <div className="presets">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className={s.activePreset === p.id ? 'p on' : 'p'}
                title={p.desc}
                onClick={() => {
                  // 顺序要紧：select 会清空 activePreset，必须最后再设预设。
                  // 机位走 request 这条带序号的通道——只靠 activePreset 的话，
                  // 连续点同一个预设会被 React 批处理吃掉，相机不再飞。
                  s.select(p.focus[0] ?? null)
                  s.setPreset(p.id)
                  s.request({ kind: 'preset', id: p.id })
                }}
              >
                {p.zh}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <input
            className="search"
            placeholder="搜索中文 / 英文 / 拉丁名"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {/*
            没输入时给**按解剖群分组的神经索引**，而不是空着。
            神经这一层有 30 条，光靠画面上点选找不齐 —— 里头的皮神经与近端干在整臂机位下
            又细又在边缘，点都点不准。列表按群聚拢、组内按解剖顺序（主干在前、分支在后、
            近端到远端），从上往下读就是「这一系从中枢到指尖怎么分叉」。
          */}
          {!q.trim() ? (
            <div className="list nidx">
              {NERVE_GROUP_ORDER.map((g) => {
                const items = NERVES.filter((n) => n.group === g)
                if (!items.length) return null
                return (
                  <div key={g}>
                    <div className="ghead">
                      <i style={{ background: NERVE_GROUPS[g].color }} />
                      <span>{NERVE_GROUPS[g].zh}</span>
                      <em>{items.length}</em>
                    </div>
                    {items.map((n) => (
                      <button
                        key={n.id}
                        className={s.selected === n.id ? 'li on' : 'li'}
                        onClick={() => s.select(n.id)}
                        title={n.en}
                      >
                        <span className="dot" style={{ background: NERVE_GROUPS[g].color }} />
                        {n.zh}
                        {/* 来源在列表上就要看得出来：整条示意的那条不能和量出来的一样混着读 */}
                        {!n.atlas && <i className="stag">示意</i>}
                        {!!n.tailPath?.length && <i className="stag">部分示意</i>}
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="list">
              {results.map((r) => (
                <button
                  key={r.id}
                  className={s.selected === r.id ? 'li on' : 'li'}
                  onClick={() => s.select(r.id)}
                >
                  <span className="dot" style={{ background: dotColorOf(r) }} />
                  {r.zh}
                  <em>{r.en}</em>
                </button>
              ))}
              {results.length === 0 && <div className="empty">没有匹配的结构</div>}
            </div>
          )}
          {MUSCLE_PENDING.length > 0 && (
            <div className="note">
              待补结构：屈肌支持带、前臂骨间膜（数据源仍在获取中）
            </div>
          )}
        </>
      )}

      {/*
        数据署名。这不是"致谢"栏目 —— CC BY-SA 要求派生作品以相同许可共享并署名，
        而这些几何已经用在成品里了。放在面板底部常驻，而不是藏进某一根神经的信息卡里：
        署名义务覆盖的是整个作品，不是某一条神经。
      */}
      <div className="attrib">
        几何数据：BodyParts3D（CC BY-SA 2.1 Japan）· Z-Anatomy（CC BY-SA 4.0），
        本作品以相同许可共享。神经层几何 2026-09 起换用 Z-Anatomy 图谱。
      </div>
    </div>
  )
}

/**
 * 「露出它」：把盖在选中结构上面的那几层剥掉。
 *
 * 深部结构（拇收肌、骨间肌、尺神经深支…）被浅层肌整片挡着，仅靠高亮是看不见的——
 * 实测选中拇收肌横头时，画面里那块肌肉完全被鱼际肌与浅屈肌盖住。
 * 剥离顺序表里它排在第 N 步，所以剥到第 N−1 步就正好把它露出来。
 *
 * 为什么是 N−1 而不是 N：剥离判定是 `step <= peelDepth` 即视为已剥掉，
 * 剥到第 N 步会把**它自己**也剥走，而 store 的 setPeelDepth 又会在此时清空选中项，
 * 于是「点了露出它，它和选中态一起消失」。N−1 是唯一同时满足两个条件的值。
 */
function RevealBlock({ meshId }: { meshId: string }) {
  const peelExpanded = useAtlas((s) => s.peelExpanded)
  const peelDepth = useAtlas((s) => s.peelDepth)
  const setPeelDepth = useAtlas((s) => s.setPeelDepth)
  const info = useMemo(() => {
    const plan = planPeel(new Set(peelExpanded))
    const step = plan.stepOf.get(meshId)
    if (step === undefined) return null
    const need = step - 1
    return {
      need,
      hidden: peelDepth < need,
      // 只报「上面那几层分别叫什么」，用户才知道自己的画面会变成什么样
      over: plan.steps.slice(peelDepth, need).map((x) => x.zh),
    }
  }, [meshId, peelExpanded, peelDepth])

  if (!info || !info.hidden || !info.need) return null
  return (
    <div className="sec">
      <h3>
        可见性
        <em>上面还盖着 {info.over.length} 层</em>
      </h3>
      <button className="act" onClick={() => setPeelDepth(info.need)}>
        剥去 {info.over.join(' → ')}，露出它
      </button>
      <div className="hint">
        深部结构被浅层整片盖住时，高亮也看不见 —— 这是解剖图绕不开的事。
        点上面的按钮按剥离顺序把它揭出来。
      </div>
    </div>
  )
}

/**
 * 穴位卡片：定位 + **实测**进针层次 + 这一点底下的结构。
 *
 * 「进针层次」用横向长条表示深度：条长按比例画，读者不必去比数字就能看出
 * 「哪一层浅、哪一层深」。合谷那三层（背侧骨间肌 → 尺神经深支 → 拇收肌横头）
 * 一眼就分得出——这正是这个层要回答的问题。
 */
function AcupointBlock({ a }: { a: Acupoint }) {
  const goto = useGoto()
  // 一律按深度取用：顺序本身就是这张表要说的事（先穿谁、后穿谁）
  const layers = layersOf(a)
  const maxD = Math.max(...layers.map((l) => l.depth), 1)
  const siblings = HAND_MERIDIANS.filter((m) => m.points.includes(a.id)).flatMap((m) =>
    m.points.filter((p) => p !== a.id).map((p) => ({ meridian: m.zh, id: p }))
  )
  const nerves = a.nerves ?? []
  const muscles = a.muscles ?? []
  return (
    <>
      <div className="sec">
        <h3>
          进针层次
          <em>以最外层结构表面为 0，共 {layers.length} 层</em>
        </h3>
        <div className="depth">
          {layers.map((l, i) => {
            // 注解层（'anatomy'）用虚线条 + 小标签，与实测层在视觉上分开——
            // 两者可信度不同，混成一样会让人以为「6mm 也是量出来的」
            const annotated = l.src === 'anatomy'
            return (
              <div className={annotated ? 'drow anno' : 'drow'} key={i}>
                <span className="dbar">
                  <i style={{ width: `${Math.max(6, (l.depth / maxD) * 100)}%` }} />
                </span>
                <b>{l.depth === 0 ? '表面' : `${l.depth}mm`}</b>
                <span className="dname">
                  {l.zh}
                  {annotated && <i className="atag">解剖方位</i>}
                  {/*
                    标本对照与上面的深度是两回事：上面是本模型的取值，这条是真人的实测区间。
                    分开成独立一行（紫底小标签）而不是并排写，就是为了不让两者被读成同一个数。
                  */}
                  {l.specimen && (
                    <i className="spcmp" title={l.specimen.text}>
                      标本实测
                      {l.specimen.mm
                        ? ` ${l.specimen.mm[0]}–${l.specimen.mm[1]}mm`
                        : '：该段未重建'}
                    </i>
                  )}
                </span>
              </div>
            )
          })}
        </div>
        <div className="hint">
          {layers.some((l) => l.src === 'anatomy') ? (
            <>
              实心条是射线实测，0 = 这条针道上最先碰到的<b>固有</b>结构（骨／肌／腱／神经）的表面；
              虚线条是解剖方位注解 —— 它不声明 mesh、也不参与深度判定，因为那种结构要么量不到、
              要么在针道<b>旁边</b>而不是针道上（径向位置量得出来、层次深度没有意义）。
            </>
          ) : (
            <>深度由实测射线量得，0 = 这条针道上最先碰到的固有结构（骨／肌／腱／神经）的表面。</>
          )}
          {' '}
          这个 0 <b>不含体表壳</b>：那层壳是由骨与肌外扩 3.5mm 估算出来的，把它算进零点，
          等于让表里每一个数都掺进一个估算量。另外模型没有真实的皮肤与皮下脂肪，
          所以这里说的是「依次经过哪些层、相对深浅如何」，不是临床进针寸数。
          {layers.some((l) => l.specimen) && (
            <>
              {' '}
              紫色标签是另一套数据：DiceCT 真人离体手标本（Steer et al. 2026）的实测区间，
              悬停可看它与本模型数值的关系 —— 它不参与上面的深度计算。
            </>
          )}
        </div>
      </div>

      {(nerves.length > 0 || muscles.length > 0) && (
        <div className="sec">
          <h3>这一点底下的结构</h3>
          {nerves.map((n) => (
            <div className="iref alt" key={n}>
              <button className="jump" onClick={() => goto(n)} title="跳到这根神经">
                {STRUCTURE_INDEX.get(n)?.zh ?? n}
                <i>›</i>
              </button>
              <span className="badges">
                <i className="pill m">神经</i>
              </span>
            </div>
          ))}
          {muscles.map((m) => (
            <div className="iref" key={m}>
              <button className="jump" onClick={() => goto(m)} title="跳到这块肌肉">
                {STRUCTURE_INDEX.get(m)?.zh ?? m}
                <i>›</i>
              </button>
              <span className="badges">
                <i className="pill s">肌肉</i>
              </span>
            </div>
          ))}
          <div className="hint">点名称可跳到对应结构；图上此刻只留下这一点穿过的层，其余肌肉已压暗。</div>
        </div>
      )}

      {siblings.length > 0 && (
        <div className="sec">
          <h3>
            同经在手部的穴位
            <em>{siblings.length} 处</em>
          </h3>
          <div className="pills">
            {siblings.map((x) => (
              <button className="apill" key={x.id} onClick={() => goto(x.id)} title={x.meridian}>
                {STRUCTURE_INDEX.get(x.id)?.zh ?? x.id}
                <em>{x.id}</em>
              </button>
            ))}
          </div>
          <div className="hint">
            经络在手上是连成一条线的：图上同经穴位之间画了虚线循行段。
          </div>
        </div>
      )}
    </>
  )
}

/**
 * 卡片跳转的取景系数（乘在模型包围球半径上，作为相机到目标点的距离）。
 *
 * 不沿用双击聚焦的默认 0.85：那是「凑到跟前看一个点」的口径，对卡片跳转太紧——
 * 实测按 0.85 得到约 308mm，画面里只剩手掌，看不到这块肌肉长在前臂的什么位置、
 * 那根神经从哪儿来。1.2 约 434mm，纵向可容约 30cm，正好装下「手 + 前臂远段」。
 */
const CARD_FOCUS_FACTOR = 1.2

/**
 * 选择某个结构并把镜头带过去 —— 信息卡里所有「可点的名字」都走这一条。
 *
 * 肌肉没有自己的「代表点」（骨与肌的网格位置要在渲染层算包围盒，信息卡拿不到），
 * 但它有个更好的替代：**支配它的那条神经的远端末点**。那正是神经抵达这块肌肉的位置——
 * 例如尺神经深支的末点就落在拇收肌与第 1 背侧骨间肌之间，也就是合谷深层。
 * 所以点肌肉名时，镜头对着的是「这块肌肉和它那根神经碰头的地方」，
 * 比对准肌肉自身的几何中心更有用。
 */
function useGoto() {
  const select = useAtlas((s) => s.select)
  const request = useAtlas((s) => s.request)
  return (id: string) => {
    select(id)
    // 一律走 focusModel：信息卡手里的点全是数据表里的模型坐标
    const acu = acupointOf(id)
    if (acu) {
      request({ kind: 'focusModel', point: acu.pos, factor: CARD_FOCUS_FACTOR })
      return
    }
    if (isNerveId(id)) {
      const p = nerveFocusPoint(id)
      if (p) request({ kind: 'focusModel', point: p, factor: CARD_FOCUS_FACTOR })
      return
    }
    const first = relatedOf(id).nerves[0]
    const tip = first ? nerveTipPoint(first) : null
    if (tip) request({ kind: 'focusModel', point: tip, factor: CARD_FOCUS_FACTOR })
  }
}

/** 「运动 / 感觉」「典型 / 变异」「节段」三个小标签 */
function Refs({ r }: { r: InnervationRef }) {
  return (
    <span className="badges">
      <i className={r.kind === 'motor' ? 'pill m' : 'pill s'}>
        {r.kind === 'motor' ? '运动' : '感觉'}
      </i>
      {r.certainty === 'variant' && <i className="pill v">变异</i>}
      <i className="pill t">{r.segments}</i>
    </span>
  )
}

/** 选中肌肉时：它由哪几条神经支配。每条都可点，点了就跳到那根神经 */
function InnervationBlock({ meshId }: { meshId: string }) {
  const goto = useGoto()
  const refs = innervationOf(meshId)
  if (!refs.length) return null
  const typical = refs.filter((r) => r.certainty === 'typical')
  const variant = refs.filter((r) => r.certainty === 'variant')
  return (
    <div className="sec">
      <h3>
        神经支配
        <em>
          {typical.length} 条典型{variant.length ? ` · ${variant.length} 条变异` : ''}
        </em>
      </h3>
      {refs.map((r, i) => {
        const st = STRUCTURE_INDEX.get(r.nerve)
        return (
          <div className={r.certainty === 'variant' ? 'iref alt' : 'iref'} key={`${r.nerve}-${i}`}>
            <button className="jump" onClick={() => goto(r.nerve)} title="跳到这根神经">
              {st?.zh ?? r.nerve}
              <i>›</i>
            </button>
            <Refs r={r} />
            {r.note && <p><RichText text={r.note} /></p>}
          </div>
        )
      })}
      <div className="hint">
        点神经名可跳到那根神经并聚焦；图上同一根神经会亮起琥珀色，亮点沿它流向远端 ——
        流向即「信号传到哪儿」的方向。
      </div>
    </div>
  )
}

/** 选中神经时：它支配哪些肌肉、负责哪片皮肤感觉 */
function SupplyBlock({ nerveId }: { nerveId: string }) {
  const goto = useGoto()
  const rows = rowsOfNerve(nerveId)
  /*
   * ⚠️ 感觉区要分两种粒度取，不能一律用 `zonesOfNerve`。
   *
   * `CUTANEOUS_ZONES[].nerve` 存的是**几何 id**（画出来的那根管），而主干本身
   * 不是任何一根管 —— 图谱在分叉处就把神经切开了。所以拿主干 id 去查恒为空，
   * 正中／尺两条主干卡片的「感觉支配区」整节不渲染，读起来像这条神经什么都不管。
   * 按 `trunk` 汇总才是临床上问的那个问题（「尺神经断了哪几片皮会麻」）。
   * 每条区下面还要标出它**登记在哪条分支**上，免得让人以为主干自己长成了那一片。
   */
  const trunkView = isTrunkId(nerveId)
  const zones = trunkView ? zonesOfTrunk(nerveId) : zonesOfNerve(nerveId)
  // 其中有多少条是「只有解剖依据、图上指不出来」的 —— 见 data/innervation.ts 的 src 字段
  const nAnatomy = zones.filter((z) => z.src === 'anatomy').length
  const typical = rows.filter((r) => r.ref.certainty === 'typical')
  const variant = rows.filter((r) => r.ref.certainty === 'variant')
  const list = [...typical, ...variant]
  return (
    <>
      <div className="sec">
        <h3>
          支配的肌肉
          <em>
            {typical.length} 块典型{variant.length ? ` · ${variant.length} 块变异` : ''}
          </em>
        </h3>
        {list.length === 0 && (
          <div className="hint">
            这条神经在本图范围内没有登记运动支配 —— 它是纯感觉支，或它的靶器官不在本图的
            前臂与手之内。
          </div>
        )}
        {list.map(({ mesh, ref }, i) => {
          const st = STRUCTURE_INDEX.get(mesh)
          return (
            <div className={ref.certainty === 'variant' ? 'iref alt' : 'iref'} key={`${mesh}-${i}`}>
              <button className="jump" onClick={() => goto(mesh)} title="跳到这块肌肉">
                {st?.zh ?? mesh}
                <i>›</i>
              </button>
              <Refs r={ref} />
              {ref.note && <p><RichText text={ref.note} /></p>}
            </div>
          )
        })}
        <div className="hint">
          {trunkView
            ? '注意这一节只列**主干本身**直接发出的分支所支配的肌肉；经深支、返支等再分支配的那些，在各自的分支卡片上列。'
            : '点肌肉名可跳到那块肌肉；此刻图上这些肌肉已亮起，其余肌肉压暗，便于看清这条神经的作用范围。'}
        </div>
      </div>

      {zones.length > 0 && (
        <div className="sec">
          <h3>
            感觉支配区
            <em>
              {zones.length} 处
              {trunkView ? '（经分支）' : ''}
              {nAnatomy > 0 ? ` · ${nAnatomy} 处图上点不出` : ''}
            </em>
          </h3>
          {zones.map((z) => {
            /*
             * 解剖登记（'anatomy'）必须与几何验证过的**一眼可分**：
             * 前者在这张图里根本高亮不出那片皮，混成一样的样式会让人以为
             * 「选中这条神经就能在图上指出那片皮肤」—— 那是错的。
             * 与进针层次表的注解层同一条规矩（实心条 vs 虚线条）。
             *
             * ⚠️ 标签写「图上指不出来」而不是「图上无几何」：这两种情况都要涵盖。
             * 正中神经掌支是**整根管子都没进手掌**；尺神经掌支的小鱼际那一段则是
             * **图上明明有管子、只是铺在别处**（图谱把它画到了掌心）。说成「无几何」
             * 会把后者描述错。
             */
            const annotated = z.src === 'anatomy'
            return (
              <div className={annotated ? 'iref anno' : 'iref'} key={z.id}>
                <b className="zname">
                  {z.zh}
                  {annotated && <i className="atag">解剖登记 · 图上指不出</i>}
                  {trunkView && (
                    <i className="zbranch">经 {STRUCTURE_INDEX.get(z.nerve)?.zh ?? z.nerve}</i>
                  )}
                </b>
                <p><RichText text={z.note} /></p>
              </div>
            )
          })}
          {trunkView && (
            <div className="hint">
              这是**按主干汇总**的结果：皮区在数据里是登记在**分支**的几何上的
              （图谱把一条神经在分叉处切成若干独立对象），所以每条都标了它经哪条分支、
              点那根分支可单独看它。
            </div>
          )}
          {nAnatomy > 0 && (
            <div className="hint">
              带虚框的是<b>解剖登记</b>：解剖上确定归这条神经，但本图谱的几何不支持它
              —— 要么那片皮下面根本没有对应的管子，要么管子画到了别处。所以选中它时
              <b>高亮不到那片皮</b>，卡片上的话有依据、图上却指不出来
              —— 与进针层次表里「解剖方位」那一档是同一条规矩。
            </div>
          )}
        </div>
      )}
    </>
  )
}

/**
 * 选中神经时：这根管子是「量出来的」还是「画出来的」。
 *
 * 2026-09-18 起整层神经换成**一套图谱几何**（与骨、肌同源），于是只剩三种情况，
 * 每一种都必须写清楚，因为它们在屏幕上一模一样：
 *
 *   - **整条图谱几何**（29 条里的 28 条）：来自 BodyParts3D / Z-Anatomy 的那具人体，
 *     与本模型的骨、肌是同一个人。配准后骨面中位距离 0.769mm，覆盖指尖到腋窝
 *     连续无空洞 —— 手指末梢那一段也是真的，不再有手／前臂／手背三种来源的接缝。
 *   - **图谱几何 + 本模型补的尾段**（只有尺神经深支）：图谱里它画到掌骨间就停了，
 *     缺跨掌到拇收肌之间那 28mm，而那正是合谷深层要讲的一段。补段处有一圈灰蓝细环，
 *     环以远是示意。
 *   - **整条示意走行**（只有正中神经返支）：图谱数据里**没有这条神经**（三重核对过），
 *     而它是腕管手术最容易误伤的一条，不能没有，所以按本模型实测的走行画出来。
 *
 * 不写清楚的话，用户会把「量出来的」与「画出来的」当成同一种东西 —— 这正是标注要挡住的误解。
 * 同理，数据许可也写在这里：几何是 CC BY-SA，署名义务是既有的（骨与肌早就在用这批数据）。
 */
function SourceBlock({ nerveId }: { nerveId: string }) {
  const def = NERVES.find((n) => n.id === nerveId)
  if (!def) return null
  const tailOnly = !def.atlas
  const partialTail = !!def.tailPath?.length
  return (
    <div className="sec">
      <h3>几何来源</h3>
      {tailOnly ? (
        <div className="iref">
          <b className="zname">全段示意走行 · 图谱数据里没有它</b>
          <p>
            正中神经返支在 Z-Anatomy 的上肢神经清单里<b>不存在</b>：29 个对象里没有它，
            唯一像候选的「正中神经肌支」按三角面连通性拆开只是前臂中段的 4 段小残根
            （Z 953–1009mm），而返支应在腕以远的 780–800；正中神经主干在 Z 786–816
            逐档的横截面都只有 1–2mm 宽，全程没有拐向鱼际的支。
          </p>
          <p>
            它是<b>腕管切开减压时最容易被误伤的一条</b>，不能没有，所以按本模型实测的走行
            画出来：全程取 Y ≤ −135（掌侧），稳定走在腕骨与大多角骨的掌侧。走行方向有据，
            <b>毫米级精度没有依据</b>。
          </p>
        </div>
      ) : partialTail ? (
        <>
          <div className="iref">
            <b className="zname">掌部以前：图谱几何</b>
            <p>
              与骨、肌同源的那具人体（BodyParts3D / Z-Anatomy）重建的神经表面。
              配准后与骨骼表面的中位距离 <b>0.769mm</b>，旋转残差 0.073°，
              只有 3.2% 的等比尺度差 —— 是放进来的，不是描上来的。
            </p>
          </div>
          <div className="iref">
            <b className="zname">跨掌到合谷那 28mm：本模型示意补段</b>
            <p>
              图谱里这条神经画到掌骨间（Z≈781mm）就停了，再往桡侧、往远端那段没有。
              缺的恰好是最有临床意义的一段 —— 它终末走在<b>拇收肌与第 1 背侧骨间肌之间</b>，
              也就是合谷深层。补段起点逐字取图谱几何的实际末端，图中<b>灰蓝细环</b>是接口，
              环以远为示意。
            </p>
          </div>
        </>
      ) : (
        <div className="iref">
          <b className="zname">图谱几何</b>
          <p>
            与骨、肌同源的那具人体（BodyParts3D / Z-Anatomy）重建的神经表面。
            走行、管径、分叉位置都是网格本身，没有一处是标定出来的。
          </p>
          <p>
            配准复核：29 块骨做相似变换 + ICP，<b>骨面中位距离 0.769mm</b>、最差 1.535mm，
            旋转残差 0.073°，只有 3.2% 的等比尺度差。另做了一次对照实验证明
            <b>零变形</b>：同一套距离测量在「完全不变换」的原始坐标系里再跑一遍，
            28/29 条的比值恰好等于缩放系数，一位不差 —— 相似变换保距，所以配准只改了尺寸。
          </p>
        </div>
      )}
      <div className="hint">
        图谱几何为 <b>CC BY-SA</b>：BodyParts3D（CC BY-SA 2.1 Japan）与
        Z-Anatomy（CC BY-SA 4.0），派生作品须以相同许可共享并署名。
        本模型的骨与肌用的是同一批派生数据 —— 这项署名义务是既有的，不是这次新增的。
      </div>
    </div>
  )
}

export function InfoCard() {
  const s = useAtlas()
  const st = s.selected ? STRUCTURE_INDEX.get(s.selected) : null
  if (!st) return null
  const acu = acupointOf(st.id)
  const funcLabel = st.layer === 'muscle' ? groupLabelOf(st.id, 'func') : null
  const trunk = st.layer === 'nerve' ? trunkOfNerve(st.id) : null
  /*
   * 图谱把「一条神经」切成了好几段各自独立的对象：主干在某处分出分支时，
   * 主干就在那里被截断，分支另立一条。所以上下邻居必须写出来 ——
   * 不写的话，用户在**孤立显示**下会看到一个断头（尺神经只画到腕上 3.6cm），
   * 那是全篇最容易把人带偏的一处误解：神经没断，是数据分段。
   */
  const kin = st.layer === 'nerve' ? nerveKin(st.id) : { from: [] as string[], to: [] as string[] }
  const kinZh = (ids: string[]) =>
    ids.map((id) => NERVES.find((n) => n.id === id)?.zh ?? id).join('、')
  return (
    <div className="card">
      <div className="cardhead">
        <span className="tag" style={{ background: LAYERS[st.layer].color }}>
          {LAYERS[st.layer].zh}
        </span>
        <button className="x" onClick={() => s.select(null)}>
          ×
        </button>
      </div>
      <h2>{st.zh}</h2>
      <div className="names">
        {acu ? (
          <>
            <div>
              <label>经穴</label>
              <span>
                {acu.id} · {acu.pinyin}
              </span>
            </div>
            <div>
              <label>经络</label>
              <span>{acu.meridian}</span>
            </div>
            <div>
              <label>定位</label>
              <span>{acu.loc}</span>
            </div>
          </>
        ) : (
          <>
            <div>
              <label>英文</label>
              <span>{st.en}</span>
            </div>
            <div>
              <label>拉丁</label>
              <span>{st.la}</span>
            </div>
            {funcLabel && (
              <div>
                <label>分组</label>
                <span>{funcLabel}</span>
              </div>
            )}
            {trunk && (
              <div>
                <label>主干</label>
                <span>{TRUNK_ZH[trunk]}的分支</span>
              </div>
            )}
            {kin.to.length > 0 && (
              <div>
                <label>远端接续</label>
                <span>{kinZh(kin.to)}</span>
              </div>
            )}
            {kin.from.length > 0 && (
              <div>
                <label>近端来自</label>
                <span>{kinZh(kin.from)}</span>
              </div>
            )}
          </>
        )}
      </div>
      {!acu && st.note && <p className="lead"><RichText text={st.note} /></p>}

      {acu && <AcupointBlock a={acu} />}
      {acu && <p className="lead"><RichText text={acu.note} /></p>}
      {st.layer === 'nerve' && <SourceBlock nerveId={st.id} />}
      {st.layer === 'muscle' && <InnervationBlock meshId={st.id} />}
      {st.layer === 'muscle' && <RevealBlock meshId={st.id} />}
      {st.layer === 'nerve' && isNerveId(st.id) && <SupplyBlock nerveId={st.id} />}

      <div className="credit">
        {st.layer === 'specimen' ? (
          <>
            Steer et al. 2026 · DiceCT 手部标本（MorphoSource 000868571）
            <br />
            开放下载 · 禁止商业使用 ／ CC BY-SA 2.1 JP · BodyParts3D
          </>
        ) : (
          'CC BY-SA 2.1 JP · BodyParts3D ／ CC BY-SA 4.0 · Z-Anatomy'
        )}
      </div>
    </div>
  )
}
