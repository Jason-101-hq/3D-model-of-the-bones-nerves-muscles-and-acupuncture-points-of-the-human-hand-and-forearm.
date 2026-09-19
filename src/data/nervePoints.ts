import { NERVE_SAMPLES, NERVE_TIP } from './nervePath'
import { nerveDef } from './nerves'

/**
 * 神经几何上的取点 —— 给「镜头飞到哪儿」用的。
 *
 * ## 为什么要单独一层
 *
 * 屏幕上那根管子分两种来源（见 `nerves.ts` 的 `atlas` 字段），取点方式也不同：
 *   - **图谱几何**：点从网格顶点里提出来，预先算好写死在 `nervePath.ts`；
 *   - **示意走行**：点就是本模型标定的路径控制点。
 *
 * 而调用方（预设机位、信息卡跳转、由肌肉反查神经末点）**只想要一个坐标**，
 * 不该关心它来自哪种几何。这个模块就是那道分界线。
 *
 * ## 2026-09-18 改动
 *
 * 原先这里还要处理「标本几何比模型 path 更准」的取舍 —— 手部那几根有两套几何，
 * 得比较距离取更近的那个。换成图谱几何后**整层神经只有一套几何**，那个分支
 * 连同它的坑（腕以下两套几何差 7~10mm、镜头会对着神经旁边的空处）一起消失了。
 */

type P3 = [number, number, number]

function d2(a: P3, b: P3) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
}

export function dist3(a: P3, b: P3) {
  return Math.sqrt(d2(a, b))
}

/**
 * 该神经的骨架采样点（近端 → 远端方向不保证，但**首点即接缝点**对拼接过的神经成立）。
 *
 * 图谱几何的采样点，加上（只有尺神经深支有的）示意补段 —— 补段必须并进来，
 * 否则「这条神经最远到哪」会答成图谱几何的断口，而不是它真正的终点。
 */
export function nerveSamples(id: string): P3[] {
  const base = NERVE_SAMPLES[id] ?? []
  const tail = nerveDef(id)?.tailPath ?? []
  if (!tail.length) return base
  return [...base, ...tail]
}

/** 该神经有没有图谱几何（false = 整条都是示意走行） */
export function hasAtlas(id: string): boolean {
  return !!nerveDef(id)?.atlas
}

/** 图上离提示点最近的那个采样点；没有几何就返回 null */
export function nerveNearest(id: string, hint: P3): P3 | null {
  const pts = nerveSamples(id)
  if (!pts.length) return null
  let best = pts[0]
  let bd = Infinity
  for (const p of pts) {
    const d = d2(p, hint)
    if (d < bd) {
      bd = d
      best = p
    }
  }
  return best
}

/**
 * 该神经的远端末点。
 *
 * 「神经末点」的语义是「它最后抵达哪里」，用来给肌肉定镜头：肌肉自身没有代表点，
 * 但支配它的神经末点就落在它身上。改走神经末端还有个额外好处 —— 镜头对准的是
 * 「神经与肌肉碰头处」，而不是肌肉的几何中心，后者常常被覆在表面的浅层结构挡住。
 *
 * ⚠️ **不能一律取 Z 最小的点**。正中神经返支恰恰是往近端返折的（它的终点 Z 比起点
 * 还大），按 Z 取会把镜头对准它刚从腕管出来的那一头。所以规则是：
 *   - 有示意补段的 → 补段是朝远端写的，取补段末点
 *   - 有图谱几何的 → 取样本里 Z 最小的（图谱几何按近端→远端存储，成立）
 *   - 只有示意路径的 → 取路径**最后一个点**（path 按近端→远端书写）
 *
 * ⚠️ 图谱几何的 Z 最小值不等于「这条神经真的到此为止」：分段存储的神经
 * （例如尺神经手背支与它下游的指背神经是两个对象）会在名义上"止住"，
 * 而几何其实由下一个对象接续。这里只回答「这一条对象到哪」，不做跨对象推断。
 */
export function nerveTip(id: string): P3 | null {
  const def = nerveDef(id)
  if (!def) return null
  const tail = def.tailPath
  if (tail?.length) {
    let tip = tail[tail.length - 1]
    for (const p of tail) if (p[2] < tip[2]) tip = p
    const fromGeom = NERVE_TIP[id]
    return fromGeom && fromGeom[2] < tip[2] ? fromGeom : tip
  }
  const t = NERVE_TIP[id]
  if (t) return t
  if (def.path?.length) return def.path[def.path.length - 1]
  return null
}

/**
 * 该神经的「代表点」—— 信息卡里点一条神经、要把镜头带过去时用它。
 *
 * 取离采样点**质心**最近的那个点，而不是「索引中点」：采样点是按连通分量顺序
 * 排列的（先整条主干的点，再整条分支的点），索引中点会随机落在某条分支上。
 * 离质心最近的点则稳定地落在主干中段一带。
 */
export function nerveMid(id: string): P3 | null {
  const pts = nerveSamples(id)
  if (!pts.length) return null
  let cx = 0
  let cy = 0
  let cz = 0
  for (const p of pts) {
    cx += p[0]
    cy += p[1]
    cz += p[2]
  }
  const c: P3 = [cx / pts.length, cy / pts.length, cz / pts.length]
  let best = pts[0]
  let bd = Infinity
  for (const p of pts) {
    const d = d2(p, c)
    if (d < bd) {
      bd = d
      best = p
    }
  }
  return best
}
