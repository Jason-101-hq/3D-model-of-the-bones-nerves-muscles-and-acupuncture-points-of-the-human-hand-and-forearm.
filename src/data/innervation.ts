/**
 * 神经支配关系 —— 结构化数据，而不是一个颜色分组
 *
 * ## 为什么要单独一个文件
 *
 * 原先「谁支配我」只以 `NERVE_OF: Record<string, 'median'|'ulnar'|'radial'|'dual'>`
 * 的形式存在，唯一用途是给肌肉上色。这丢掉了临床真正要用的三样东西：
 *
 *   1. **粒度**：拇收肌记的是 `'ulnar'`，于是「深支」这个信息在数据里就没了。
 *      而尺神经在肘管受压、在 Guyon 管受压、深支在掌部受压，是三个不同的病。
 *   2. **性质**：运动还是感觉。合谷的答案本身就是「浅层感觉归桡神经浅支、
 *      深层运动归尺神经深支」——糊成一个字段就等于丢掉一半价值。
 *   3. **变异**：Riche–Cannieu 吻合时拇收肌可由正中神经支配，这直接决定
 *      「单说尺神经」有时是错的。
 *
 * 所以这里把每条关系记成一条结构化记录：**哪根神经（几何 id）、归属哪条主干、
 * 运动还是感觉、哪些脊髓节段、典型还是变异**。肌肉着色的四档分组改为从这里派生，
 * 保证「颜色」与「信息卡」「高亮关联」用的是同一份数据，不会各说各话。
 *
 * 命名与依据：Terminologia Anatomica 2 ／ 标准解剖学教材（Moore、Gray's、Netter）。
 * 变异条目一律标注 `certainty: 'variant'`，并在 note 里写明意义与不确定性——
 * 变异的发生率各研究差异很大，这里只写「有这回事、方向如何」，不编具体百分比。
 */

/**
 * 神经主干。
 *
 * 与 `NerveDef.id` 的区别在于：id 是「画出来的那根管子」（如 `ulnar-deep`、
 * `anterior-interosseous`），主干是「临床上说的那条神经」（正中／尺／桡）。
 * 两者都要留：高亮要按管子，诊断推理要按主干。
 */
export type NerveTrunk = 'median' | 'ulnar' | 'radial'

/** 着色用的四档分组。'dual' = 两条以上主干共同支配 */
export type NerveGroup = NerveTrunk | 'dual'

export type InnervationKind = 'motor' | 'sensory'
export type Certainty = 'typical' | 'variant'

export interface InnervationRef {
  /** 对应 `NerveDef.id` —— 几何上该高亮哪根管子 */
  nerve: string
  /** 归属主干 —— 临床上「哪条神经」 */
  trunk: NerveTrunk
  kind: InnervationKind
  /** 脊髓节段，如 'C8–T1' */
  segments: string
  certainty: Certainty
  /** 该条关系的要点：卡压表现、判断价值、变异说明等 */
  note?: string
}

/** 典型运动支配 */
const typ = (nerve: string, trunk: NerveTrunk, segments: string, note?: string): InnervationRef => ({
  nerve,
  trunk,
  kind: 'motor',
  segments,
  certainty: 'typical',
  note,
})

/** 变异（或「越界」）支配 —— 存在但不可当默认 */
const alt = (nerve: string, trunk: NerveTrunk, segments: string, note: string): InnervationRef => ({
  nerve,
  trunk,
  kind: 'motor',
  segments,
  certainty: 'variant',
  note,
})

/* ------------------------------------------------------------------ 前臂前群 */

const FOREARM_FLEXORS: Record<string, InnervationRef[]> = {
  'humeral head of left pronator teres': [typ('median', 'median', 'C6–C7')],
  'ulnar head of left pronator teres': [
    typ('median', 'median', 'C6–C7', '正中神经由此头与尺头之间穿过 —— 旋前圆肌综合征的卡压部位'),
  ],
  'left flexor carpi radialis': [typ('median', 'median', 'C6–C7')],
  'left palmaris longus': [typ('median', 'median', 'C7–C8', '约 15% 人群先天缺如')],
  'left flexor digitorum superficialis': [
    typ('median', 'median', 'C7–T1'),
    alt(
      'ulnar',
      'ulnar',
      'C8–T1',
      '第 4 指（有时第 3 指）的指浅屈肌可由尺神经越界支配，比例个体差异很大；故不能凭「某个手指能不能屈」单独定位损伤平面'
    ),
  ],
  'left flexor digitorum superficialis (2)': [typ('median', 'median', 'C7–T1')],
  'left flexor pollicis longus': [
    typ(
      'anterior-interosseous',
      'median',
      'C8–T1',
      '骨间前神经是正中神经的分支 —— 单纯 AIN 卡压只有运动障碍、无感觉障碍，这一点正是它区别于腕管综合征的地方'
    ),
  ],
  'left pronator quadratus': [
    typ('anterior-interosseous', 'median', 'C8–T1', '前臂旋前的主要动力；AIN 卡压时最早出现无力'),
  ],
  'left flexor digitorum profundus': [
    typ('ulnar', 'ulnar', 'C8–T1', '第 4、5 指（尺侧半）—— 由尺神经**主干**在前臂直接发出，不经深支'),
    typ('anterior-interosseous', 'median', 'C8–T1', '第 2、3 指（桡侧半）'),
    alt(
      'ulnar',
      'ulnar',
      'C8–T1',
      '尺神经对第 3 指的越界支配相当常见，所以「第 3 指能否屈曲」不能单独用来判定损伤平面'
    ),
  ],
  'humeral head of left flexor carpi ulnaris': [
    typ('ulnar', 'ulnar', 'C7–C8', '尺神经由此头之间的腱膜下进入前臂'),
    alt('median', 'median', 'C7–C8', 'Martin–Gruber 吻合（正中→尺的前臂交通支）时可由正中神经支配'),
  ],
  'ulnar head of left flexor carpi ulnaris': [typ('ulnar', 'ulnar', 'C7–C8')],
}

/* ------------------------------------------------------------------ 前臂后群 */

const FOREARM_EXTENSORS: Record<string, InnervationRef[]> = {
  'left brachioradialis': [
    typ(
      'radial',
      'radial',
      'C5–C6',
      '由桡神经**主干**在肘部发出 —— 桡神经沟处损伤时它最先无力；其深面即桡神经浅支的通道（Wartenberg 综合征的卡压层）'
    ),
  ],
  'left extensor carpi radialis longus': [
    typ('radial', 'radial', 'C6–C7', '同样由桡神经主干在肘部发出，故高位桡神经损伤与 PIN 卡压的表现不同'),
  ],
  'left extensor carpi radialis brevis': [
    typ(
      'posterior-interosseous',
      'radial',
      'C7–C8',
      '由深支在 Frohse 腱弓**之前**发出 —— 因此骨间后神经卡压时它通常不受累，这个「 spared 」是定位体征'
    ),
  ],
  'left extensor digitorum': [typ('posterior-interosseous', 'radial', 'C7–C8')],
  'left extensor digiti minimi': [typ('posterior-interosseous', 'radial', 'C7–C8')],
  'left extensor carpi ulnaris': [typ('posterior-interosseous', 'radial', 'C7–C8')],
  'left extensor carpi ulnaris (2)': [typ('posterior-interosseous', 'radial', 'C7–C8')],
  'left anconeus': [typ('radial', 'radial', 'C7–C8', '由桡神经主干在肱骨外侧发出')],
  'left supinator': [
    typ('posterior-interosseous', 'radial', 'C6–C7', '深支穿其近侧缘的 Frohse 腱弓 —— 骨间后神经最常见的卡压点'),
  ],
  'left abductor pollicis longus': [typ('posterior-interosseous', 'radial', 'C7–C8')],
  'left extensor pollicis longus': [typ('posterior-interosseous', 'radial', 'C7–C8')],
  'left extensor pollicis brevis': [typ('posterior-interosseous', 'radial', 'C7–C8')],
  'left extensor indicis': [typ('posterior-interosseous', 'radial', 'C7–C8')],
}

/* ------------------------------------------------------------------ 手内在肌 */

const HAND_MUSCLES: Record<string, InnervationRef[]> = {
  // —— 鱼际：正中神经返支（腕管手术最关键的一条神经）——
  'left abductor pollicis brevis': [
    typ('median-recurrent', 'median', 'C8–T1', '腕管综合征时最早出现萎缩的大鱼际肌'),
    alt(
      'ulnar-deep',
      'ulnar',
      'C8–T1',
      'Riche–Cannieu 吻合（正中返支与尺神经深支在掌部交通）时可由尺神经支配 —— 故「大鱼际萎缩一定是腕管」并不成立'
    ),
  ],
  'superficial head of left flexor pollicis brevis': [
    typ('median-recurrent', 'median', 'C8–T1'),
    alt('ulnar-deep', 'ulnar', 'C8–T1', 'Riche–Cannieu 吻合；其深头由尺神经深支支配，是正中-尺神经交通的典型例证'),
  ],
  'left opponens pollicis': [
    typ('median-recurrent', 'median', 'C8–T1', '拇指对掌功能的核心肌'),
    alt('ulnar-deep', 'ulnar', 'C8–T1', 'Riche–Cannieu 吻合'),
  ],

  // —— 拇收肌：尺神经深支。这句话的反面正是合谷那道题的答案 ——
  'oblique head of left adductor pollicis': [
    typ('ulnar-deep', 'ulnar', 'C8–T1', 'Froment 征的检查靶肌'),
    alt('median-recurrent', 'median', 'C8–T1', 'Riche–Cannieu 吻合时可改由正中神经支配'),
  ],
  'transverse head of left adductor pollicis': [
    typ('ulnar-deep', 'ulnar', 'C8–T1', '合谷深层的靶肌；与斜头之间是掌深弓与尺神经深支的通道'),
    alt('median-recurrent', 'median', 'C8–T1', 'Riche–Cannieu 吻合'),
  ],

  // —— 小鱼际：尺神经深支。肘管综合征的观察窗 ——
  'abductor digiti minimi of left hand': [
    typ('ulnar-deep', 'ulnar', 'C8–T1', '小鱼际萎缩是肘管综合征的体征之一'),
  ],
  'flexor digiti minimi brevis of left hand': [typ('ulnar-deep', 'ulnar', 'C8–T1')],
  'opponens digiti minimi of left hand': [typ('ulnar-deep', 'ulnar', 'C8–T1')],

  // —— 掌中间群 ——
  'set of lumbricals of left hand': [
    typ('median-digital', 'median', 'C8–T1', '第 1、2 蚓状肌（桡侧两条）—— 由正中神经在掌部的指掌侧总神经支配'),
    typ('ulnar-deep', 'ulnar', 'C8–T1', '第 3、4 蚓状肌（尺侧两条）'),
    alt(
      'ulnar-deep',
      'ulnar',
      'C8–T1',
      'Martin–Gruber 吻合时桡侧两条也可由尺神经支配 —— 这是「肘管综合征出现爪形手、而腕管综合征不出现」这一差别背后的原因之一'
    ),
  ],
  'set of palmar interossei of left hand': [
    typ('ulnar-deep', 'ulnar', 'C8–T1', '使手指内收（并指）'),
  ],
  'set of dorsal interossei of left hand': [
    typ('ulnar-deep', 'ulnar', 'C8–T1', '使手指外展（分指）；第 1 背侧骨间肌最易检见萎缩，也是合谷深层的结构'),
  ],
}

/**
 * 全部「肌肉 mesh → 支配关系」。
 *
 * 支持结构（屈肌支持带、前臂骨间膜）不在此表内 —— 它们不是肌肉，没有运动支配，
 * 着色沿用图层的支持结构灰。
 */
export const INNERVATION_OF: Record<string, InnervationRef[]> = {
  ...FOREARM_FLEXORS,
  ...FOREARM_EXTENSORS,
  ...HAND_MUSCLES,
}

/* --------------------------------------------------------------- 皮神经感觉区 */

/**
 * 皮神经感觉支配区。
 *
 * 单独一张表，因为它的「对象」不是某块肌肉，而是一片皮肤区域 —— 无法挂到 mesh 上。
 * 但它回答的问题同样关键，而且和上面那张表配合才完整：
 * 「尺神经损伤时虎口区感觉为什么保留」的答案就在这里。
 */
export interface CutaneousZone {
  id: string
  zh: string
  /**
   * 对应 `NerveDef.id` —— 注意这指的是**画出来的那根管子**，不是解剖学上那条神经。
   *
   * ⚠️ 图谱在分叉处把一条神经切成好几段各自独立的对象，所以「近端主干」和
   * 「远端分支」是两个不同的 id。填错不会报错，只会让高亮落在另一段管子上。
   * 改这一列之前先跑 `_recon/zanatomy/wire/audit_nerve_refs.cjs`，它有证据。
   * 另：**一片皮只登记一条管**；如果这片皮确实横跨两段（例如既含手背又含指背），
   * 应该拆成两个区，而不是在这里并列两条 —— 并列之后「区」和「管」就不是一对一了，
   * 两侧检查也就没了意义。
   */
  nerve: string
  trunk: NerveTrunk
  /**
   * 这条登记的依据是「几何」还是「解剖」。
   *
   *   · `'geom'`（**缺省**）—— 图谱里有对应的管子，且实测贴得住这片皮。
   *     `audit_nerve_refs.cjs` 会按下面两种口径之一判定（覆盖 + 不虚标）。
   *   · `'anatomy'` —— 解剖上确定归它，但**本图谱没有这片皮下面的几何**
   *     （例如正中神经掌支，图谱只画到腕横纹、没进手掌）。这种记录
   *     **不参与距离判定**，脚本会单独清点出来，绝不会因此被当成「已验过」。
   *
   * 加这一档的理由与深度表完全一样：`acupoints.ts` 的层次表里早就有
   * `src: 'measured' | 'anatomy'` 两档，注解层**不许声明 `mesh`**、
   * 不许伪装成实测。感觉区这边同理 —— 宁可如实标「只有解剖依据」，
   * 也不能把一条没几何可验的记录混进「已验」里。
   */
  src?: 'geom' | 'anatomy'
  /**
   * 解剖范围（模型坐标 mm）：**给没有穴位可锚定的皮区用**。
   *
   * 判定口径有两种，取决于这片皮上有没有穴位：
   *   · 有穴位（虎口、指背…）→ 拿区内穴位的**体表落点**量到登记的管子（`probes`）。
   *   · **没有穴位**（手掌、小鱼际 —— 掌部一个穴位都没有）→ 退回到「解剖范围」：
   *     在 `bounds` 圈出的范围内按网格采集**体表采样点**，量「这条管横向上铺不铺在这片皮下」。
   *
   * ⚠️ `why` 必须写、且必须**独立于这条登记本身**。用待验的那根管子自己的范围去划区，
   * 是循环论证 —— 它当然覆盖自己。这里的边界一律来自**骨性标志**
   * （掌骨、腕横纹、掌指关节），那些几何与神经无关，不会跟着一起动。
   *
   * 🔴 量的是**切向距离**（顶点到「过采样点、沿皮法线的那条射线」的垂直距离），
   * 不是 3D 距离：皮神经**本来就走在皮下**，用 3D 距离会让它天生吃亏、
   * 反而让走在骨面上的深层结构占便宜 —— 那问的不是「铺不铺在这片皮下」。
   * 同时必须配**深度窗口**，否则手背的神经会「穿透式」假阳性
   * （掌侧点沿法线向下量得足够深就穿到手的另一面了）。
   */
  bounds?: ZoneBounds
  note: string
}

export interface ZoneBounds {
  /** X 范围（模型坐标 mm；**+X = 桡侧**） */
  x: [number, number]
  /** Z 范围（模型坐标 mm；**Z 大 = 肘端**，腕横纹 ≈ 797、掌指关节 ≈ 752） */
  z: [number, number]
  /** 这两条边界从哪来 —— 必须是骨性标志，不能是「待验的那条管」 */
  why: string
}

export const CUTANEOUS_ZONES: CutaneousZone[] = [
  {
    id: 'first-web-dorsum',
    zh: '虎口区 · 手背桡侧',
    /*
     * ⚠️ 2026-09-18：这里原来写的是 `radial-superficial`，换图谱几何后**指错了对象**。
     *
     * 解剖上那句话没错 —— 虎口区确实归桡神经浅支。但这个字段是**几何 id**
     * （`NerveDef.id`，见上面 `CutaneousZone.nerve` 的说明），而图谱是按解剖单位切开的：
     * `radial-superficial` 这一段**止于腕／鼻烟窝**，手背与指背那一段另存为
     * `radial-dorsal-digital`。实测：合谷处到 `radial-superficial` 最近 24mm、
     * 二间处 59mm（它离手部最近的那个顶点在 Z=773.5，还在腕上）；
     * 换指 `radial-dorsal-digital` 后合谷 5.5mm、三间 3.8mm、二间 4.2mm。
     *
     * 修法不是改「说的话」，是改「指着谁」。`_recon/zanatomy/wire/audit_nerve_refs.cjs`
     * 会对这一列做左右两侧检查（覆盖 + 不虚标），改完必须跑它。
     */
    nerve: 'radial-dorsal-digital',
    trunk: 'radial',
    note: '虎口区与手背桡侧的皮肤感觉由桡神经浅支负责 —— 它不经腕管、也不经 Guyon 管。因此尺神经在肘部或腕部受压时，虎口区感觉保留，这是与神经根／臂丛病变鉴别的要点。图上高亮的是图谱里「桡神经指背神经」这一束（浅支在手背的那一段），它才是真正铺在这一带皮肤下的几何；腕以上的浅支主干是它的上一段。',
  },
  {
    id: 'palmar-radial-3half',
    zh: '掌侧桡侧 3½ 指',
    nerve: 'median-digital',
    trunk: 'median',
    /*
     * ⚠️ 本区只管**指**，不含大鱼际。
     * 大鱼际与掌心的皮是正中神经**掌皮支**（`median-palmar`）的地盘，与本区不是同一条管。
     * 实测拿鱼际 LU10 当探测点，到 `median-digital` 差 27mm —— 那是点选错了区，不是表错。
     *
     * 🔴 2026-09-18 更正：原先这里写着「掌皮支那片皮要补得先定它与尺神经掌皮支的界线」。
     * 实测发现真正的原因**更靠前**：本图谱根本没有掌皮支在手掌内的几何
     * （见下面 `thenar-palmar-radial` 的注释）。所以那是**数据缺口**，
     * 不是「界线难定」—— 界线再清楚也没有可指的管子。
     */
    note: '拇指、示指、中指及环指桡侧半的掌面感觉归正中神经。经腕管受压时最先出现夜间麻醒，且感觉障碍的分布是「桡侧 3½ 指」。本区指这 3½ 指掌面的皮肤；大鱼际与掌心的皮另有来源（正中神经掌皮支），不在本区。',
  },
  {
    id: 'thenar-palmar-radial',
    zh: '大鱼际 · 掌心桡侧',
    nerve: 'median-palmar',
    trunk: 'median',
    /*
     * 🔴 本区是**解剖登记**（`src: 'anatomy'`）—— 图谱缺这片皮下面的几何。
     *
     * 2026-09-18 实测（`probe_palmar_fields.cjs` / `probe_palm_surface.cjs` / `audit_nerve_refs.cjs`）：
     *   · 图谱的 `Palmar branch of median nerve.l` **只有一个对象**（没有「下一段」可换，
     *     与虎口区那种「指错了对象」不是一回事），其 Z 范围 789.9–885.8，
     *     即**腕横纹 → 前臂**方向，再往远端（手掌方向）一个顶点都没有；
     *   · 掌面 643 个采样点（每 (X,Z) 列取最掌侧的体表顶点）到它的距离**中位 43mm**，
     *     仅 21 点 ≤10mm，且全部挤在腕横纹那一条线上；
     *   · 穴位口径：太渊 LU9 **3.86mm**（唯一贴得住的），鱼际 LU10、劳宫 PC8 都 **>22mm**。
     *
     * 所以本区**不参与距离判定**，也**无法在图上高亮一片皮** —— 选中掌支时，
     * 能亮的只有腕横纹那一段管子。若要高亮，就得去指 `median-digital` 那束，
     * 而那在解剖上是错的（指掌侧总神经管的是手指掌面，不是大鱼际的皮）。
     *
     * 为什么明知验不了仍然登记：这句话是腕管综合征定位诊断里最有用的之一 ——
     * 掌皮支**不经腕管**，所以腕管受压时这一片感觉保留而手指麻木。
     * 不登记的话，选中掌支时信息卡上「负责哪片皮」整节不出现，
     * 看起来像「这条神经什么都不管」——那比标一句「解剖如此、几何缺失」错得更远。
     */
    src: 'anatomy',
    note: '大鱼际与掌心桡侧的皮肤感觉由**正中神经掌皮支**负责 —— 它在腕横纹近侧发出、穿腕横韧带浅面下行，**不经腕管**。因此腕管受压时手指麻木、而这一片皮肤感觉保留，这条差别正是把手腕处的压迫与前臂／正中神经主干的问题分开的依据（与尺神经掌支不受 Guyon 管压迫同一个道理）。⚠️ 本区为**解剖登记**：本图谱没有这条皮支在手掌内的几何，它只画到腕横纹，所以选中它时高亮的管子止于腕部、掌部这一片皮在图上点不出来。',
  },

  /* --------------------------- 手掌尺侧（尺神经掌支）：2026-09-19 补 ---------------------------
   *
   * 这两条区都在**同一根管**（`ulnar-palmar`）的地盘上，必须分开登记 —— 因为它们的
   * 几何支持度完全相反，混在一条里就没法如实标 `src`：
   *
   *   · 掌心尺侧半：图谱**有**几何，实测覆盖 63%（缺的部分是掌远段 —— 管子画到
   *     掌中就收了），标 `src: 'geom'`（默认），缺口在 note 里如实写明。
   *   · 小鱼际：图谱的管子**根本没铺到这里**（只贴住 6%），只能标 `src: 'anatomy'`。
   *
   * 它们都**没有穴位可锚定**（整个手掌一个穴位都没有），所以两条都走 `bounds`
   * 「解剖范围 + 体表采样点」那条口径，而不是穴位口径。
   *
   * ⚠️ 两条区的边界**全部**来自骨与体表标志（掌骨、掌指关节线、腕横纹、手掌尺侧缘），
   * 不来自那根待验的管子 —— 用管子自己的范围去划区是循环论证，它当然覆盖自己。
   */
  {
    id: 'palm-central-ulnar',
    zh: '掌心尺侧半',
    nerve: 'ulnar-palmar',
    trunk: 'ulnar',
    /*
     * 2026-09-19 实测（本区数字一律引用 `audit_nerve_refs.cjs` 的口径）：
     *   · 本区 X 245.4–262.4 / Z 725.3–797 共 **133 个体表采样点**，
     *     `ulnar-palmar` **覆盖 66 个 = 50%**（切向 ≤8mm 且深度 ∈[−22,+2]mm），
     *     覆盖处深度中位 **−3.9mm** —— 典型的皮支深度。
     *   · 缺的那 50% **整块挤在掌端**，是审计脚本查出来的、不是估的：
     *     沿 Z 分两半 —— 腕端半（Z 760.9–795.9）覆盖 **97%（66/68）**，
     *     掌端半（Z 725.9–760.9）覆盖 **0%（0/65）**。
     *     ⇒ 是**这段管子比它的解剖地盘短**（图谱画到掌中 Z≈762 就收了），
     *     **不是引用错、也不是区划错**。
     *   · 同一片皮上横向重叠的还有 `median-digital`（86%，但走 −10.6mm，掌腱膜深面）
     *     与 `ulnar-common-digital`（54%，−8.7mm）—— 分得开它们的是**层次**，不是覆盖率。
     *     `audit_nerve_refs.cjs` 的 `bounds` 分支专门为这种情况写了判据（见文件头 4c）：
     *     「覆盖率低 + 覆盖处深度像皮支 + 竞争者更深 + 缺口整块在一端」= 管子短，不是引用错。
     *
     * ⚠️ 三种采样口径会给出不同的百分数（探针 `probe_hypothenar.cjs` 用全局 205 起点，
     * 取到 107 点、算得 63%；审计早期版本用区自己的原点，取到 150 点、算得 47%）。
     * 方向与结论一致，差的是网格划分。**引用数字时认审计口径，别混着抄。**
     *
     * ⚠️ 前两版这个区的边界写错过：先是「取中点 774」（无任何标志依据），
     * 又把 Z 752 当成掌指关节 —— 实测第 4 掌骨远端在 **725.3**，752 落在掌骨体中部。
     * 边界必须能被骨验；写错不会报错，只会让覆盖率看起来比实际更漂亮
     * （窄框 + 错标签那一版报的是「98% 覆盖、✓」）。
     */
    bounds: {
      x: [245.4, 262.4],
      z: [725.3, 797],
      why: '桡侧界 262.4 = 第 3 掌骨轴线（(252.4+272.3)/2 = 262.35，即手的长轴＝掌中线，「掌尺侧半」的内侧界）；尺侧界 245.4 = 第 5 掌骨桡侧缘（小鱼际与掌心的骨性分界）；近端 797 = 腕横纹（与神门 HT7 同高，尺侧当豌豆骨水平 789.7–801.3）；远端 725.3 = 第 4 掌骨远端（掌骨头，即掌指关节线所在）。四条全部取自骨与体表标志，与待验的神经几何无关。',
    },
    note: '尺神经掌支负责手掌尺侧的皮肤感觉 —— 即掌心尺侧半（第 5 掌骨桡侧缘到掌中线之间，掌指关节至腕横纹）。它自前臂远端发出、穿尺侧腕屈肌与掌腱膜，**不经 Guyon 管** —— 所以 Guyon 管受压时这一片感觉保留，而肘部（肘管）受压时它连同小鱼际一起麻木。这条差别正是把损伤平面定在腕与肘之间的依据。⚠️ 图谱的这根管子画到掌中（Z≈762）就收了，掌端那半（靠掌指关节一侧）在图上点不出来 —— 那片皮肤另有来源（指掌侧总神经的掌侧皮支）。小鱼际隆起那一片见下一条。',
  },
  {
    id: 'hypothenar',
    zh: '小鱼际',
    nerve: 'ulnar-palmar',
    trunk: 'ulnar',
    /*
     * 🔴 本区是**解剖登记**（`src: 'anatomy'`）—— 但缺口的位置和正中神经掌支那条
     * **不一样**，不能照抄那句话（那条是「图上无几何」，这条图上是有东西的，
     * 只是铺错了地方）。2026-09-19 实测（`audit_nerve_refs.cjs` 口径，网格覆盖地图见
     * `probe_hypothenar.cjs`）：
     *
     *   本区范围（X 220.6–245.4 / Z 732–797）**185 个体表采样点**里，
     *   `ulnar-palmar` 只贴住 **9 个 = 5%**，排第 **8/13** —— 而且屈指可数的那几个
     *   全部挤在最桡侧一列（X≈245，刚越过本区桡侧界的边缘，其实是掌心的覆盖漏过来）。
     *   这一带皮面下站着的是 **`ulnar-proper-digital`（小指指掌侧固有神经）**，
     *   覆盖 84%（156/185）、深度中位 −11.6mm；其次是 `ulnar-dorsal`（手背支）61%。
     *
     *   为什么不能因此改登记成小指固有神经：**解剖上那句话是错的** ——
     *   指掌侧固有神经管的是小指本身的皮肤，它沿手掌尺侧缘走只是路过，
     *   不负责小鱼际隆起的皮。这正是虎口区那条教训的反面：
     *   虎口区是「话没错、指错了对象」，这里是「对象就在那儿、但话不对」。
     *   所以**不能改指对象来让审计过关**，只能如实标成解剖登记。
     */
    src: 'anatomy',
    bounds: {
      x: [220.6, 245.4],
      z: [732, 797],
      why: '尺侧界 220.6 = 手掌尺侧缘（体表采样点实测最尺侧 X 220.6，随 Z 由 220.6 变到 228.8，取最宽处，保证整个小鱼际隆起都在区内）；桡侧界 245.4 = 第 5 掌骨桡侧缘（小鱼际与掌心的骨性分界）；远端 732 = 第 5 掌骨远端（掌骨头，即第 5 掌指关节线）；近端 797 = 腕横纹。',
    },
    note: '小鱼际（第 5 掌骨掌面与掌短肌区）的皮肤同样归尺神经掌支，临床上看的就是这一片 —— 肘管综合征时它先麻。⚠️ 本区为**解剖登记**：本图谱这段掌支的几何只走到掌心（最尺侧 X≈244），没有铺到小鱼际隆起上，所以选中掌支时高亮不到这一片皮。',
  },
  {
    id: 'forearm-distal-radial',
    zh: '前臂远端桡侧皮区',
    nerve: 'radial-superficial',
    trunk: 'radial',
    note: '桡神经浅支在前臂远端桡侧转往背侧时位置表浅，戴手表过紧或前臂远端受压即可致该区麻木 —— Wartenberg 综合征。',
  },

  /* 手背皮神经（2026-09 新增）。前三条是这一层补画之后才有的；正因为原先缺了
   * 它们在数据里的登记，「尺神经损伤时手背尺侧为什么还麻」这类问题在图上无处可指。 */
  {
    id: 'dorsum-ulnar-third',
    /*
     * ⚠️ 2026-09-18：标题原来是「手背尺侧 ⅓ · 小指／环指指背」，一条记录横跨两个区域。
     * 图谱里这两块皮肤归**两条不同的管**：手背归 `ulnar-dorsal`（手背支），
     * 指背归 `ulnar-dorsal-digital`（指背神经）。于是无论填哪个 id，另一半都是错的
     * （实测：只填 `ulnar-dorsal` 时，小指末节那一端差 64mm）。
     * 拆开的做法是**让「一片皮 = 一条管」**：这里只留手背，指背交给下面两条。
     */
    zh: '手背尺侧 ⅓',
    nerve: 'ulnar-dorsal',
    trunk: 'ulnar',
    note: '手背尺侧 ⅓ 的皮肤归尺神经手背支。关键在**发出高度**：它自腕上约 5cm 发出，因此尺神经在腕部（Guyon 管）受压时本区感觉保留，而肘部（肘管）受压时本区麻木 —— 用它可以把损伤平面从腕与肘之间区分开。小指与环指的**指背**是它的下一段（指背神经），见下面两条。',
  },
  {
    id: 'dorsal-digital-ring',
    /*
     * 标题从「环指指背 · 尺侧」扩到小指 + 环指：小指指背原先只在上面那条的标题里
     * 提了一句，挂在手背支下面 —— 而它其实归指背神经。搬到这里之后，
     * 「小指／环指指背」由同一条管负责，覆盖反而比原来完整。
     */
    zh: '小指／环指指背 · 尺侧',
    nerve: 'ulnar-dorsal-digital',
    trunk: 'ulnar',
    note: '小指两侧与环指尺侧的指背由尺神经的指背神经负责。注意手背的桡／尺分界个体变异很大，经典写的「桡侧 2½ 指对尺侧 1½ 指」在实测中常表现为两侧各 2½ 指。图谱几何把各指的指背支**合并成一个对象**（腕以下逐指分开的那几条在源数据里没有独立对象），所以画面上高亮的是整束，不是单独这一条 —— 本区仍按皮节登记，因为临床问诊问的是「哪块皮肤麻」。',
  },
  {
    id: 'dorsal-digital-index',
    zh: '示指指背',
    nerve: 'radial-dorsal-digital',
    trunk: 'radial',
    note: '示指背侧归桡神经浅支的指背支。它不经腕管、也不经 Guyon 管，所以正中神经或尺神经受压都不会影响示指背 —— 这是与 C6 神经根病变鉴别时的要点。与尺侧同理，图谱几何里它并进「桡神经指背神经」这一束。',
  },
  {
    id: 'dorsal-digital-middle',
    zh: '中指指背 · 桡侧',
    nerve: 'radial-dorsal-digital',
    trunk: 'radial',
    note: '中指背侧桡侧归桡神经浅支。中指背由桡神经与尺神经共同支配的比例很高，因此单凭中指背麻木的范围推断损伤平面并不可靠。',
  },
]

/* -------------------------------------------------------------------- 查询 */

/** 该结构的全部支配关系（含变异）。非肌肉或未登记返回空数组 */
export function innervationOf(meshId: string): InnervationRef[] {
  return INNERVATION_OF[meshId] ?? []
}

/** 只取典型支配 —— 判断「正常应该归谁」时用这个 */
export function typicalOf(meshId: string): InnervationRef[] {
  return innervationOf(meshId).filter((r) => r.certainty === 'typical')
}

/**
 * 着色用的四档分组，**由支配关系派生**。
 *
 * 典型关系里出现两条以上主干就是「双重支配」（指深屈肌、蚓状肌）；
 * 没有典型关系时退回看变异关系，免得整块肌肉失去颜色。
 */
export function deriveNerveGroup(meshId: string): NerveGroup | null {
  const all = innervationOf(meshId)
  if (!all.length) return null
  const typical = all.filter((r) => r.certainty === 'typical' && r.kind === 'motor')
  const use = typical.length ? typical : all.filter((r) => r.kind === 'motor')
  if (!use.length) return null
  const trunks = [...new Set(use.map((r) => r.trunk))]
  return trunks.length === 1 ? trunks[0] : 'dual'
}

/** 某条神经（几何 id）直接支配的肌肉 —— 「这条神经本身管什么」 */
export function musclesByNerve(nerveId: string): string[] {
  return Object.keys(INNERVATION_OF).filter((m) =>
    INNERVATION_OF[m].some((r) => r.nerve === nerveId)
  )
}

/**
 * 某条神经的「支配清单」—— 每块肌肉连同它在该神经下的那条关系。
 *
 * 与 `musclesByNerve` 的区别：那个只回名字，信息卡要展示的是「运动还是感觉、
 * 哪些节段、典型还是变异」，必须把关系本身一起带出来，否则 UI 得再查一遍表。
 */
export function rowsOfNerve(nerveId: string): { mesh: string; ref: InnervationRef }[] {
  const out: { mesh: string; ref: InnervationRef }[] = []
  for (const [mesh, refs] of Object.entries(INNERVATION_OF)) {
    for (const ref of refs) if (ref.nerve === nerveId) out.push({ mesh, ref })
  }
  // 典型在前、变异在后；同组内按节段与肌肉名排序，保证每次渲染顺序一致
  out.sort(
    (a, b) =>
      (a.ref.certainty === b.ref.certainty ? 0 : a.ref.certainty === 'typical' ? -1 : 1) ||
      a.ref.segments.localeCompare(b.ref.segments) ||
      a.mesh.localeCompare(b.mesh)
  )
  return out
}

/** 该神经负责的皮神经感觉区（不是肌肉，所以单独一张表） */
export function zonesOfNerve(nerveId: string): CutaneousZone[] {
  return CUTANEOUS_ZONES.filter((z) => z.nerve === nerveId)
}

/* ------------------------------------------------ 按主干汇总（主干卡片要用） */

/** 三条主干 —— 它们本身就是 `NerveTrunk` 的取值 */
export const TRUNK_IDS: NerveTrunk[] = ['median', 'ulnar', 'radial']

/** 选中的是主干（正中／尺／桡）还是某一根具体的管子 */
export function isTrunkId(id: string): id is NerveTrunk {
  return (TRUNK_IDS as string[]).includes(id)
}

/**
 * 归属某主干的**全部**皮区 —— **含由它的各条分支登记的那些**。
 *
 * 🔴 为什么必须单独有这个函数：`CUTANEOUS_ZONES[].nerve` 存的是**几何 id**
 * （画出来的那根管子），而主干本身不是任何一根管 —— 图谱在分叉处就把神经切开了，
 * 分叉以后每条分支才是独立对象。于是直接拿主干 id 去查 `zonesOfNerve` 恒为空，
 * 卡片上「感觉支配区」整节不渲染，读起来像**这条神经不负责任何皮肤**：
 * 正中、尺两条主干的卡片一直是这样（纯感觉支的皮区全登记在分支上）。
 *
 * 而临床上问的恰恰是主干粒度的问题 ——「尺神经断了，哪几片皮会麻」。
 * 按 `trunk` 汇总才是那个答案。卡片上会同时标出每条区**登记在哪条分支**上，
 * 免得让人误以为「主干自己长成了那一片」。
 */
export function zonesOfTrunk(trunk: NerveTrunk): CutaneousZone[] {
  return CUTANEOUS_ZONES.filter((z) => z.trunk === trunk)
}

/** 归属某主干的所有肌肉（含经分支支配的）—— 「这条神经断了谁会瘫」 */
export function musclesByTrunk(trunk: NerveTrunk): string[] {
  return Object.keys(INNERVATION_OF).filter((m) =>
    INNERVATION_OF[m].some((r) => r.trunk === trunk)
  )
}

/** 该结构支配关系的可读摘要，如「尺神经 深支 · 运动 · C8–T1」 */
export function describeRef(r: InnervationRef, nameOf: (id: string) => string): string {
  const kind = r.kind === 'motor' ? '运动' : '感觉'
  const tag = r.certainty === 'variant' ? '变异' : ''
  return [nameOf(r.nerve), kind, r.segments, tag].filter(Boolean).join(' · ')
}
