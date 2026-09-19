/**
 * 手部穴位 —— 体表定位 + **实测**进针层次
 *
 * ## 为什么坐标不是手写的
 *
 * 传统定位（如「第 2 掌骨桡侧中点」）只说了方位，落到三维模型上还差两个数：
 * 体表在哪、底下依次是什么。定位这些点时模型里还没有体表壳（09-16 才加），靠包围盒
 * 推出来的「表面」常常差出一两厘米，标记要么浮在空中、要么埋进组织。所以每个穴位的落点都由
 * `_recon/neuro/probe_acupoints.cjs` 从体外沿解剖方位投射射线实测得到 ——
 * 取第一个命中点作为体表点，而命中序列本身恰好就是**进针层次**。
 *
 * 实测的副产品是最有价值的部分：合谷的层次里，尺神经深支正走在第 1 背侧骨间肌与
 * 拇收肌横头之间的肌间隙（距骨间肌表面 2.8mm）。这解释了「为什么合谷既查手内在肌、又治手背麻木」——
 * 深层归尺神经深支，浅层归桡神经手背支，一层一根神经（见上面「神经引用」一节）。
 *
 * ## 数据来源与边界
 *
 * - 定位描述：国家标准《经穴部位》(GB/T 12346) 与针灸学教材的通行表述。
 * - 层次与深度：本模型实测，**不是**临床进针深度规范。模型没有真实的皮肤与皮下脂肪，
 *   所以这里只写「依次经过哪些结构、相对位置如何」，不写「应刺几寸」。
 * - 归属经络：按标准经脉循行归经。
 *
 * ## 零点只有一个：最外层**固有**结构的表面
 *
 * 全部深度以**骨／肌／腱／神经这些源数据里的固有结构**的最外层表面为 0。
 *
 * 🔴 为什么不是「最外层可见结构」：2026-09-16 加进来的那层体表壳是**估算几何**
 * （由骨与肌外扩 3.5mm 用 marching cubes 算出来，自身带已知偏差，见 skin.glb 的说明）。
 * 把估算面当成实测零点，等于让整张表的每一个数都掺进一个估算量。所以体表壳
 * **不参与**这里任何深度的计算 —— 复核脚本也必须按名字把它剔除，否则每个穴位会
 * 整体前移一个皮厚（合谷处 9.26mm），全表一致偏移，看起来像数据错。
 *
 * ## 神经引用：图谱是按「解剖单位」切的，不是按「一条神经」切的
 *
 * 本模型的神经几何来自 Z-Anatomy，它把一条神经**在分叉处截断**，分支另立一个对象。
 * 于是同一个名字在手部往往只有一截几何：
 *
 * | 引用 id | 实际覆盖范围 | 手部那一段在哪 |
 * | --- | --- | --- |
 * | `radial-superficial` 桡神经浅支 | 前臂段，止于腕 | `radial-dorsal-digital`（指背神经） |
 * | `ulnar` 尺神经主干 | 止于腕上 36mm | `ulnar-superficial`（含 Guyon 管段） |
 * | `median` 正中神经主干 | 止于腕 | `median-digital` / `median-proper-digital` |
 *
 * ⚠️ 所以「某某神经就在这个点底下」这句话，换成图谱几何后**可能只是引用指错了对象**：
 * 桡神经浅支在合谷量出来是「离针道 24mm」，而真正在手背桡侧皮下走的那条叫
 * `radial-dorsal-digital`（离 5.5mm）。两者都是解剖事实，差的是名字。
 * 复核一律走 `_recon/zanatomy/wire/audit_nerve_refs.cjs` —— 它会把**全部 30 条**神经
 * 对每个穴位排名，指错对象的引用会沉到榜尾，一眼看得出来。
 */

/** 由外向内的一个层次（深度单位 mm，以最外层**固有**结构的表面为 0） */
export interface AcuLayer {
  zh: string
  /** 该结构距最外层固有结构表面的深度；0 = 射线在这条针道上第一个碰到的固有结构 */
  depth: number
  /** 本模型里对应的 mesh 名（若有），便于与图谱其他部分对上 */
  mesh?: string
  /**
   * 这一层的深度是怎么来的。**必须如实标注**，因为两种来源的可信度不一样：
   *
   * - `'measured'`（默认）：来自射线实测（`probe_acupoints.cjs` 取体表点、
   *   `audit_nerve_refs.cjs` / `probe_layers.cjs` 复核该结构是否真在针道上）。
   *   可以逐条复核，说「实测」不含糊。
   * - `'anatomy'`：解剖方位注解。**这类层不允许写 `mesh`** —— 判定标准就落在这上面：
   *   一条射线命中判不出来、只能靠「最近点偏离几毫米」勉强挂钩的结构，量不出层次深度，
   *   就如实说它是方位描述。两种情况会走到这里：
   *     ① 这个位置本来就没有该结构（例如「针尖深面是哪块肌的起点区」，射线打不出一个数）；
   *     ② 结构**在针道旁边而不是针道上**，径向位置量得出来、层次深度没有意义
   *        （神门的尺神经就是这一类：偏离针道 0.97mm，但投影深度是 −2.5mm）。
   *   `mesh` 一旦写上，就会被复核脚本当成「实测层」去比深度，那正是要防的**谎称实测**。
   *
   * 面板上两者画法不同（实测实心、注解虚线），读者一眼就知道哪条能拿去对着模型核。
   */
  src?: 'measured' | 'anatomy'
  /**
   * 该层在 **DiceCT 真值标本**（Steer et al. 2026）上的对照值。
   *
   * 这一项**不参与深度计算**，也不改变上门的 `depth` —— 它只回答一个另立的问题：
   * 「本模型给出的这个数，放到真人身上是多少？」
   *
   * 之所以要单列：上面的 `depth` 全部量自本模型（BodyParts3D/Z-Anatomy 的示意几何），
   * 而示意几何在某些部位本就简化过（例如拇收肌斜头只有 43 个三角面）。一个数只有
   * 一个来源时，读者没法判断它是「解剖事实」还是「这套模型的取值」。有了标本对照，
   * 落在区间内 → 可放心引用；落在区间外 → 说明白是本模型的取值。
   *
   * `mm` 缺省表示该结构在标本数据里量不到（例如尺神经深支在合谷段未被重建），
   * 那就只能挂一句说明，不能编一个数出来。
   */
  specimen?: {
    /** 标本实测区间（mm）。量的是什么、以及它与本模型数值的关系，写在 text 里 */
    mm?: [number, number]
    text: string
  }
}

export interface Acupoint {
  /** 经穴代码，同时作为选中 id，如 'LI4' */
  id: string
  zh: string
  pinyin: string
  /** 所属经络 */
  meridian: string
  /**
   * 体表点（模型坐标 mm）。
   * 由 probe_acupoints.cjs 沿解剖方位投射射线实测，再沿射线反方向外移 1.5mm
   * 使其浮在表面上 —— 手写坐标会飘，实测点永远贴着结构。
   */
  pos: [number, number, number]
  /**
   * 由体表指向体内的单位方向（模型坐标）。
   *
   * 就是实测时那条射线的方向：从体外打进去，所以它天然等于「进针方向」。
   * 有了它才能把 `layers` 里那些「距体表多少 mm」画成一条有刻度的进针线 ——
   * 否则那些深度只是几个数字，读者对不上它们在手背的哪一层。
   */
  inward: [number, number, number]
  /** 传统定位描述 */
  loc: string
  /** 进针层次（实测） */
  layers: AcuLayer[]
  /** 该穴涉及的肌肉（mesh id）—— 选中该穴时这些肌肉会亮起 */
  muscles?: string[]
  /** 该穴涉及的神经（NerveDef.id）—— 选中时对应神经会亮起并流光 */
  nerves?: string[]
  /** 要点：为什么这个位置有意义 */
  note: string
}

export const ACUPOINTS: Acupoint[] = [
  {
    id: 'LI4',
    zh: '合谷',
    pinyin: 'Hegu',
    meridian: '手阳明大肠经',
    // 实测：体表为第 1 背侧骨间肌背侧面，位于第 1、2 掌骨之间的骨间隙（实测该层间隙 X 277~296）
    pos: [284, -127.3, 753],
    inward: [0, -1, 0],
    loc: '手背，第 1、2 掌骨间，第 2 掌骨桡侧的中点处',
    layers: [
      {
        zh: '第 1 背侧骨间肌',
        depth: 0,
        mesh: 'set of dorsal interossei of left hand',
        specimen: {
          mm: [3.2, 11.3],
          text: '标本实测该肌厚度 3.2–11.3mm（常见 4–7mm）。本模型这一层取 4.6mm，落在区间内——这个数可以放心当解剖事实引用。',
        },
      },
      /*
       * 深支的深度不是猜的，也不是「取个中间值」：把尺神经深支这段管的顶点与进针线
       * 逐一比对（wire/audit_nerve_refs.cjs），最近点偏离针道 0.11mm、深 2.79mm ——
       * 它以不到 0.2mm 的偏差贴着这条线走，而且就落在**第 1 背侧骨间肌与拇收肌横头
       * 之间那道肌间隙里**（同一条线上的分层实测：骨间肌 0 → 深支 2.8 → 拇收肌 4.6，
       * 神经在两者之间偏拇收肌一侧）。
       *
       * ⚠️ 这个数被修正过两次，两次都不是解剖看错了，而是「尺子」变了：
       *   1. 曾写成 5.5 —— 量的是「距浮在体表外的那个标记点」的距离，而同一张表其它层
       *      量的是「距最外层结构表面」，两个零点差约 1.5mm，于是深支被排到拇收肌
       *      **后面**，跟它自己「走在两肌之间」的注解正好打架。
       *   2. 2026-09-18 神经几何整层从示意管换成图谱网格，深 3.98 → 2.79mm。
       *      **几何换了，数字就得跟着重测** —— 表里的数不会自己变，也不会报错。
       * 层次表里所有深度只能有一个零点：最外层**固有**结构的表面（不含估算的体表壳）。
       */
      {
        zh: '尺神经深支（肌间隙内走行）',
        depth: 2.8,
        mesh: 'ulnar-deep',
        specimen: {
          // 不编数字：标本数据在这一段确实没有深支几何，只能如实说缺
          text: '标本数据里量不到这一段：深支重建到掌骨间即止，末端缺约 20mm，恰好就是跨过第 1 背侧骨间肌的合谷段。所以「深支距骨间肌表面 2.8mm」这个数只有本模型一个来源，未经真人标本复核。',
        },
      },
      {
        zh: '拇收肌 横头（背面）',
        depth: 4.6,
        mesh: 'transverse head of left adductor pollicis',
        specimen: {
          mm: [0.2, 2.5],
          text: '标本实测：第 1 背侧骨间肌深面与拇收肌浅面之间只有 0.2–2.5mm，两肌基本相贴。本模型把两肌标在 0mm 与 4.6mm，间隔比标本宽；但深支落在距骨间肌 2.8mm 处 —— 这个数落在标本给出的区间内，方向与量级都对。',
        },
      },
      { zh: '掌腱膜／掌侧体表', depth: 9, mesh: 'left palmaris longus' },
    ],
    muscles: [
      'set of dorsal interossei of left hand',
      'transverse head of left adductor pollicis',
      'oblique head of left adductor pollicis',
    ],
    /*
     * 浅层原来是 `radial-superficial`（桡神经浅支）。换成图谱几何后这条引用**指错了对象**：
     * 图谱把桡神经浅支的手部那一段另存成了 `radial-dorsal-digital`（指背神经），
     * 而 `radial-superficial` 自己的几何只到腕 —— 在合谷量出来是「离针道 24.25mm」。
     * 换名之后实测 5.47mm，且落在皮下（投影 −8.9mm，即比骨间肌表面更靠背侧）。
     * 两者都是真的，差别只是「浅支」和「浅支的指背支」是两个对象。
     */
    nerves: ['ulnar-deep', 'radial-dorsal-digital'],
    note: '合谷是「一层一根神经」的典型：浅层皮肤感觉归桡神经手背支的指背支（本模型实测：它从针道桡侧 5.5mm 的皮下经过，是这一点最浅的神经），深层运动归尺神经深支 —— 深支实测就在针道下方 2.8mm、偏离仅 0.1mm 处，正走在第 1 背侧骨间肌与拇收肌横头之间那道肌间隙里（再深 1.8mm 才进拇收肌）。所以这一个点既是手背桡侧的皮区，又可以用来查手内在肌（Froment 征的就近部位），两个答案分别落在两条神经上——这正是它「主治广泛」的解剖底子。',
  },
  {
    id: 'LI3',
    zh: '三间',
    pinyin: 'Sanjian',
    meridian: '手阳明大肠经',
    pos: [288, -128.6, 727],
    inward: [0, -1, 0],
    loc: '手背，第 2 掌指关节桡侧近端凹陷中',
    layers: [
      { zh: '第 2 掌骨背面', depth: 0, mesh: 'left_second_metacarpal_bone' },
      /*
       * 这一层标成注解，是因为射线**没有**打到它：从体表直刺下去，线上只有第 2 掌骨。
       * 骨间肌长在掌骨之间的骨间隙里，不在掌骨正下方，所以它离针道还有几毫米。
       * 「深面就是骨间肌起点区」这句本身没错，但它不是一个量出来的深度。
       */
      { zh: '第 1 背侧骨间肌（起点区）', depth: 6, src: 'anatomy' },
    ],
    muscles: ['set of dorsal interossei of left hand'],
    // 同合谷那条（见上）：手背桡侧的皮神经在图谱里叫 radial-dorsal-digital，
    // 而 radial-superficial 的几何只到腕 —— 在这一穴量出来差 49.5mm，换名后 3.82mm。
    nerves: ['radial-dorsal-digital'],
    note: '位于第 2 掌骨头的近侧，是手阳明大肠经从合谷走向指端的必经处。它的深面即第 1 背侧骨间肌的起点区。',
  },
  {
    id: 'LI2',
    zh: '二间',
    pinyin: 'Erjian',
    meridian: '手阳明大肠经',
    pos: [292, -132.8, 718],
    inward: [0, -1, 0],
    loc: '手背，第 2 掌指关节桡侧远端凹陷中',
    layers: [{ zh: '示指近节指骨底背面', depth: 0, mesh: 'proximal_phalanx_of_left_index_finger' }],
    // 实测 4.24mm（换名前 radial-superficial 是 59.33mm）
    nerves: ['radial-dorsal-digital'],
    note: '在示指掌指关节的桡侧，与三间以第 2 掌指关节为界：三间在关节近端，二间在远端。',
  },
  {
    id: 'LI1',
    zh: '商阳',
    pinyin: 'Shangyang',
    meridian: '手阳明大肠经',
    pos: [309, -172, 669.7],
    inward: [0, 0, 1],
    loc: '示指末节桡侧，距指甲角 0.1 寸',
    layers: [
      { zh: '示指末节指骨', depth: 0, mesh: 'distal_phalanx_of_left_index_finger' },
      // 同上：井穴的进针方向是**沿手指轴**的，针道贴着指骨侧面走，打不到下一节指骨的中点
      { zh: '示指中节指骨（远端）', depth: 9, src: 'anatomy' },
    ],
    // 示指桡侧指背归桡神经指背支（实测 1.74mm、就在皮下；换名前那条是 30.77mm）
    nerves: ['radial-dorsal-digital'],
    note: '手阳明大肠经的起始井穴。循行由此沿示指桡侧上行，经二间、三间、合谷、阳溪出前臂——所以这一列点在手上连成一条明确的线。',
  },
  {
    id: 'LI5',
    zh: '阳溪',
    pinyin: 'Yangxi',
    meridian: '手阳明大肠经',
    /*
     * 🔴 落点与下面两层的深度都在 2026-09-18 重测并**整体下移 9.7mm**。
     *
     * 原因是这个穴位的最外层结构就是一根**神经**：09-15 量落点时，第一个命中的
     * 是当时那根示意管（在 Y≈−108.4），于是 pos 定在 −106.9。神经几何换成图谱网格后，
     * 真正的桡神经浅支在 Y≈−118.1 —— 而落点不会自己跟着变，**也不会报错**，
     * 只是那颗小球孤零零飘在半空（面板上看不出来，因为标记本来就在体表外一点）。
     * 探测方式：wire/probe_acu_surface.cjs 把 13 个点重算一遍做差；其余 12 个差 0.00mm，
     * 只有它差 9.7mm。
     *
     * 连带项：下面两层的深度是「距最外层结构表面」的差值，零点一移，两个数一起移，
     * 且移的量相同。它们**没有**任何数据自己能发现这件事 —— 差值是同一把尺子量出来的，
     * 尺子变了，差值跟着变而不显眼。所以换几何之后要重测的是「落点 + 全部层次」。
     */
    pos: [281, -116.6, 798],
    inward: [0, -1, 0],
    loc: '腕背横纹桡侧，拇指上翘时两肌腱之间的凹陷（解剖学鼻烟窝）',
    layers: [
      { zh: '桡神经浅支（该处最浅的结构）', depth: 0, mesh: 'radial-superficial' },
      { zh: '手舟骨／大多角骨', depth: 9.8, mesh: 'left_trapezium' },
      { zh: '拇短展肌', depth: 23.3, mesh: 'left abductor pollicis brevis' },
    ],
    nerves: ['radial-superficial'],
    // ↑ 这一条**复核过、是对的**：鼻烟窝处桡神经浅支的主干尚未分成指背支，
    //   实测它的最近点离针道 0.38mm，而且**就是第一个命中的结构**（= 本穴的最外层）——
    //   换几何之后表里「该处最浅的结构」这句被实测证实了。
    //   同一张表里合谷／三间／二间／商阳写它才是错的 —— 那几处在手上、已属于指背支的地盘。
    note: '鼻烟窝底是手舟骨——手舟骨骨折时此穴处压痛（「鼻烟窝压痛」是重要的临床体征）。实测此处的体表最外层结构就是桡神经浅支本身：它不经腕管、也不经 Guyon 管，因此尺神经受压时这一带的皮肤感觉保留，这正是与神经根／臂丛病变鉴别的要点。',
  },
  {
    id: 'LU11',
    zh: '少商',
    pinyin: 'Shaoshang',
    meridian: '手太阴肺经',
    pos: [317, -163, 728.4],
    inward: [0, 0, 1],
    loc: '拇指末节桡侧，距指甲角 0.1 寸',
    layers: [
      { zh: '拇指末节指骨', depth: 0, mesh: 'distal_phalanx_of_left_thumb' },
      { zh: '拇指近节指骨', depth: 11.2, mesh: 'proximal_phalanx_of_left_thumb' },
    ],
    note: '手太阴肺经的井穴。肺经在手上只走桡侧三穴（少商—鱼际—太渊），与大肠经在虎口处相接。',
  },
  {
    id: 'LU10',
    zh: '鱼际',
    pinyin: 'Yuji',
    meridian: '手太阴肺经',
    pos: [302.4, -142, 779],
    inward: [-1, 0, 0],
    loc: '第 1 掌骨中点桡侧，赤白肉际处',
    layers: [
      { zh: '第 1 掌骨桡侧面', depth: 0, mesh: 'left_first_metacarpal_bone' },
      { zh: '拇对掌肌', depth: 17.8, mesh: 'left opponens pollicis' },
      { zh: '掌长肌腱', depth: 35.5, mesh: 'left palmaris longus' },
    ],
    muscles: ['left opponens pollicis', 'left abductor pollicis brevis'],
    nerves: ['median-recurrent'],
    // ↑ 复核过：不换。实测最近点离针道 8.11mm（在针道近端的腕管出口处），
    //   对「这一层的肌肉归谁支配」这句话是准确的 —— 返支支配的正是针道下方这片鱼际肌。
    //   它不是「针道正下方的结构」，所以注解里只讲支配关系，不写它在本穴深面（见 note）。
    note: '「鱼际」既是穴名也是肌群名（大鱼际）。这一层主要由正中神经返支支配——腕管综合征时大鱼际萎缩，此处外形会变平坦，是体格检查最容易看出差别的地方。（本模型实测：返支本体离本穴针道约 8mm，位于针道近端的腕管出口处；它支配的鱼际肌正好就在针道下方。这一点上「神经的位置」与「肌的支配」不是同一件事，容易混。）',
  },
  {
    id: 'LU9',
    zh: '太渊',
    pinyin: 'Taiyuan',
    meridian: '手太阴肺经',
    pos: [272, -136.9, 801],
    inward: [0, 1, 0],
    loc: '腕掌侧横纹桡侧，桡动脉搏动处（拇指长展肌腱与桡侧腕屈肌腱之间）',
    layers: [
      { zh: '拇短展肌', depth: 0, mesh: 'left abductor pollicis brevis' },
      { zh: '大多角骨／手舟骨', depth: 2.8, mesh: 'left_trapezium' },
      { zh: '拇长伸肌腱', depth: 27.3, mesh: 'left extensor pollicis longus' },
    ],
    muscles: ['left abductor pollicis brevis'],
    /*
     * 原来写的是 `median`（正中神经主干）。换几何后这条**指错了对象**，而且方向也反了：
     * 正中神经主干在腕管里，位于太渊**尺侧** 18.84mm —— 它压根不在这一点底下
     * （要在它底下的是大陵那一穴）。真正贴在这一带的是它的两条分支：
     *   · `median-palmar` 掌支 —— 实测离针道 3.86mm、几乎贴着表面走（投影 −3.0mm）
     *   · `median-recurrent` 返支 —— 7.37mm，偏尺侧一些
     * 掌支换上来是个升级：它「不经腕管、在上腕横纹近侧发出」这个特点，正是太渊
     * 作为「腕管桡侧壁」这一讲法的落点。
     */
    nerves: ['median-palmar', 'median-recurrent'],
    note: '中医脉诊「寸口」就在此处——桡动脉在腕掌侧桡侧端最表浅。而桡侧腕屈肌腱与拇长展肌腱之间的这个位置，也正是**腕管桡侧壁**：腕管切开减压时针刀若偏向桡侧，最容易伤到的就是正中神经在腕部发出的两条分支 —— 掌支（本模型实测：几乎贴表面走，离针道 3.9mm）与返支（离 7.4mm，更靠尺侧些）。这里原先写的是「正中神经主干就在本穴深面」，实测站不住：主干在腕管里、位于本穴尺侧近 19mm，真正该讲的是这两条分支。',
  },
  {
    id: 'PC8',
    zh: '劳宫',
    pinyin: 'Laogong',
    meridian: '手厥阴心包经',
    pos: [267, -143.6, 750],
    inward: [0, 1, 0],
    loc: '掌心，第 2、3 掌骨之间偏于第 3 掌骨',
    layers: [
      { zh: '掌长肌腱／掌腱膜', depth: 0, mesh: 'left palmaris longus' },
      { zh: '蚓状肌', depth: 7.5, mesh: 'set of lumbricals of left hand' },
      { zh: '拇收肌 横头', depth: 11.9, mesh: 'transverse head of left adductor pollicis' },
      { zh: '第 3 掌骨', depth: 15.5, mesh: 'left_third_metacarpal_bone' },
      { zh: '骨间背侧肌', depth: 22.2, mesh: 'set of dorsal interossei of left hand' },
    ],
    muscles: ['set of lumbricals of left hand', 'transverse head of left adductor pollicis'],
    // 原来的 `ulnar-deep` 换掉了：实测它离本穴针道 16.97mm（深支在掌心偏尺侧走），
    // 算不上「这一点底下的结构」。留在注解里讲那一层即可（见 note）。
    nerves: ['median-digital'],
    note: '手掌最深的一条通道：从掌面进去要依次穿过腱膜、蚓状肌、拇收肌横头才到掌骨。掌中间隙的感染常沿这一层扩散。而尺神经深支与掌深弓也走在拇收肌这一层的深面 —— 注意是**这一层的深面**，不是本穴针道的正下方：本模型实测深支离本穴针道尺侧约 17mm，也就是在掌中偏尺侧那一半走行。针道正下方那根是正中神经的指掌侧总神经（实测偏离 5.04mm、深 2.78mm）。',
  },
  {
    id: 'PC9',
    zh: '中冲',
    pinyin: 'Zhongchong',
    meridian: '手厥阴心包经',
    pos: [276, -186, 656.2],
    inward: [0, 0, 1],
    loc: '中指末端最高点',
    layers: [{ zh: '中指末节指骨（指腹侧）', depth: 0, mesh: 'distal_phalanx_of_left_middle_finger' }],
    note: '手厥阴心包经的井穴，位于中指末端。心包经在手部只走掌中两穴（中冲—劳宫），支配这一片的正中神经指掌侧总神经。',
  },
  {
    id: 'HT7',
    zh: '神门',
    pinyin: 'Shenmen',
    meridian: '手少阴心经',
    pos: [242, -132.5, 797],
    inward: [0, 1, 0],
    loc: '腕掌侧横纹尺侧端，豌豆骨桡侧缘（尺侧腕屈肌腱桡侧）',
    layers: [
      { zh: '尺侧腕屈肌腱', depth: 0, mesh: 'humeral head of left flexor carpi ulnaris' },
      /*
       * 原来这里写的是「豌豆骨 @6mm」—— 错的，而且是**量出来的错**：
       * 把豌豆骨与进针线比对，最近点偏 1.97mm、深度 −1.24mm，也就是它在体表点旁边、
       * 根本不在针道上（它是定位用的表面标志，不是针下的一层）。
       *
       * 它被换成了「尺神经」，方向是对的（这一点最有临床意义的解剖就是它），
       * 但 2026-09-18 神经几何换代后又重测了一次（wire/probe_ht7_order.cjs 横向扫描
       * ＋ wire/audit_nerve_refs.cjs 最近点），**新几何给出的是另一个故事**：
       *
       *   横向扫描（Z=797，从掌侧垂直进针，看谁先被命中）：
       *     X=240.5  尺神经浅支 → 尺神经深支 → 尺侧腕屈肌腱
       *     X=241    尺神经浅支 → 尺神经深支 → 尺侧腕屈肌腱
       *     X=242    尺侧腕屈肌腱（本穴针道就在这里 —— 只有肌腱，没有神经）
       *     X=243    尺侧腕屈肌腱（再往桡侧是大多角骨／腕骨）
       *   最近点比对：尺神经浅支离针道 0.97mm，但它在针道方向上投影为 −2.5mm，
       *   也就是**比肌腱表面还靠掌侧**（更浅）。
       *
       * 结论：尺神经在豌豆骨与尺侧腕屈肌腱之间（Guyon 管）**与针道并行**，
       * 不在针道上、也不在肌腱深面 —— 「先肌腱、再深 4.4mm 到神经」这句话在新几何里
       * 不成立，它量不出一个层次深度。所以这一条按实际情况改成解剖方位层：
       * 结构在针道**旁边**而不是针道上，径向位置量得出来、层次深度没有意义。
       *
       * ⚠️ 顺带纠一个独立的错：原来写的「腕管内」是错的。腕管里走的是**正中神经**；
       * 尺神经走的是**Guyon 管**（豌豆骨与钩骨钩之间），两者的边界、受压表现
       * （腕管征 vs Guyon 管征）都不一样，混用会直接讲错病。
       */
      {
        zh: '尺神经（豌豆骨与尺侧腕屈肌腱之间 — Guyon 管，与针道并行）',
        depth: 0,
        src: 'anatomy',
      },
    ],
    muscles: ['humeral head of left flexor carpi ulnaris'],
    // 尺神经浅支的几何覆盖了腕段（主干 `ulnar` 止于腕上 36mm，止不到这里 —— 见文件头）。
    // 实测它离针道 0.97mm 就在近旁，深支此刻与它并行，所以两条都列上。
    nerves: ['ulnar-superficial', 'ulnar-deep'],
    note: '豌豆骨是 Guyon 管的内侧界——尺神经与尺动脉正是在豌豆骨与尺侧腕屈肌腱之间进入手掌。本模型实测：从神门直刺进去，针道上只有尺侧腕屈肌腱；而**尺神经就贴着肌腱的尺侧缘走，离针道只有约 1mm，深度上与肌腱几乎同层（略偏掌侧）** —— 它不是肌腱深面的一层，而是与针道并行的邻居，这恰恰是这一点要小心的地方。豌豆骨同样不在针道上，它在入针点尺侧约 2mm、恰好在体表高度，所以它是「摸得到的定位标志」，不是针下的层次。尺神经在此受压即 Guyon 管综合征（手内在肌无力而手背感觉保留）。',
  },
  {
    id: 'HT9',
    zh: '少冲',
    pinyin: 'Shaochong',
    meridian: '手少阴心经',
    pos: [224, -175, 680.7],
    inward: [0, 0, 1],
    loc: '小指末节桡侧，距指甲角 0.1 寸',
    layers: [{ zh: '小指末节指骨', depth: 0, mesh: 'distal_phalanx_of_left_little_finger' }],
    note: '手少阴心经的井穴，行于小指桡侧——注意与手太阳小肠经的少泽（小指尺侧）仅一指甲之隔，两经在小指上分居两侧。',
  },
  {
    id: 'SI3',
    zh: '后溪',
    pinyin: 'Houxi',
    meridian: '手太阳小肠经',
    pos: [224.2, -145, 740],
    inward: [1, 0, 0],
    loc: '第 5 掌指关节尺侧后方，横纹头赤白肉际处',
    layers: [
      { zh: '小指展肌', depth: 0, mesh: 'abductor digiti minimi of left hand' },
      { zh: '小指短屈肌', depth: 3.4, mesh: 'flexor digiti minimi brevis of left hand' },
      { zh: '指浅屈肌腱', depth: 8.8, mesh: 'left flexor digitorum superficialis' },
    ],
    muscles: ['abductor digiti minimi of left hand', 'flexor digiti minimi brevis of left hand'],
    /*
     * 原来写的是 `ulnar-deep`（尺神经深支）。换几何后这条**指错了对象**：
     * 深支在这个高度绕钩骨钩转向掌深部，实测离本穴针道 18.4mm —— 在小指侧根本量不到它。
     * 真正贴着针道走的是 `ulnar-proper-digital`（尺神经 指掌侧固有神经，
     * 沿小指尺侧到指尖的终末支）：实测偏离 2.85mm、就在皮下（投影 −2.0mm）。
     * 这恰好也说明一件事 —— 后溪在「赤白肉际」，那一带的皮下就是感觉神经末梢，
     * 而不是深层的运动支。
     */
    nerves: ['ulnar-proper-digital'],
    note: '手尺侧缘的穴位，底下就是小鱼际肌群——**肘管综合征的观察窗**。尺神经在肘部受压时，小鱼际萎缩会最先在山根样隆起的这一带变平，比自觉症状出现得早。本模型实测：贴在本穴针道皮下的其实是尺神经最末端的那一级分支（小指的指掌侧固有神经，偏离 2.85mm），而管小鱼际运动的那支（深支）离这里 18.4mm —— 「这个点底下的感觉神经」与「这块肌的运动神经」不是同一条，前者贴着手边、后者在掌深部。',
  },
]

/* --------------------------------------------------------------- 经脉循行 */

/**
 * 经脉在手部的循行段 —— 用于把同一经的穴位连成线。
 *
 * 只列在手部这一段：经脉的主体走向在前臂以上，超出本图范围。
 * 连线的意义是回答「为什么合谷在这里」——它在大肠经从示指桡侧一路上行的必经处，
 * 而不是一个孤立的点。
 */
export interface HandMeridian {
  id: string
  zh: string
  en: string
  /** 按经脉循行顺序排列的穴位 id（近端 → 远端 或 远端 → 近端，与循行方向一致） */
  points: string[]
}

export const HAND_MERIDIANS: HandMeridian[] = [
  { id: 'LI', zh: '手阳明大肠经', en: 'Large Intestine meridian', points: ['LI1', 'LI2', 'LI3', 'LI4', 'LI5'] },
  { id: 'LU', zh: '手太阴肺经', en: 'Lung meridian', points: ['LU11', 'LU10', 'LU9'] },
  { id: 'PC', zh: '手厥阴心包经', en: 'Pericardium meridian', points: ['PC9', 'PC8'] },
  { id: 'HT', zh: '手少阴心经', en: 'Heart meridian', points: ['HT9', 'HT7'] },
  { id: 'SI', zh: '手太阳小肠经', en: 'Small Intestine meridian', points: ['SI3'] },
]

/* ------------------------------------------------------------------ 查询 */

export const ACUPOINT_BY_ID: Map<string, Acupoint> = new Map(ACUPOINTS.map((a) => [a.id, a]))

export function acupointOf(id: string): Acupoint | undefined {
  return ACUPOINT_BY_ID.get(id)
}

/** 某条经脉的全部在手穴位（含坐标），用于连线 */
export function meridianPath(m: HandMeridian): [number, number, number][] {
  return m.points
    .map((id) => ACUPOINT_BY_ID.get(id)?.pos)
    .filter((p): p is [number, number, number] => !!p)
}

/**
 * 按深度升序返回某穴的进针层次。
 *
 * 排序不是装饰：信息卡的层次条与 3D 进针线上的环都按这个顺序画，而「顺序」
 * 本身就是这张表要传达的信息（先穿谁、后穿谁）。曾经因为一个深度值量错了零点，
 * 尺神经深支被排到拇收肌**后面**，读起来就成了「先到肌肉、再到神经」，
 * 与它自己的注解（走在两肌之间的间隙里）正面矛盾。按深度取用可以挡住这类错位：
 * 只要数字对，顺序就一定跟数字走。
 */
export function layersOf(a: Acupoint): AcuLayer[] {
  return [...a.layers].sort((x, y) => x.depth - y.depth)
}
