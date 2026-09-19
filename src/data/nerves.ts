/**
 * 神经清单 —— 这个项目里「神经层有哪些管子、每根叫什么、几何从哪来」的唯一出处。
 *
 * ## 2026-09-18：几何来源整体换代
 *
 * 换之前，神经层是**三种来源拼起来的**：手部三根用 DiceCT 离体手标本的实测几何，
 * 前臂段是本模型按骨骼包围盒标定的示意走行，手背四条干脆是补画的（连标本扫描范围
 * 都不在）。三者在屏幕上长得一模一样，可靠度却差着量级 —— 信息卡里要专门写一段
 * 来解释这件事。
 *
 * 现在换成 **Z-Anatomy 图谱几何**：一整套 29 条，来自与骨、肌完全相同的那具人体
 * （BodyParts3D / Z-Anatomy 的 TARO 模型）。它的好处不是"更精确"，而是**自洽**：
 * 神经、骨、肌第一次来自同一个人，不再需要拼接、不再需要在手部前臂之间画接缝环。
 *
 * 配准与验收见 `_recon/zanatomy/spike/report.html`：骨面中位距离 0.769mm、
 * 零变形（相似变换，纯等比缩放 967.8），覆盖指尖（656.3mm）到腋窝（1332.0mm）连续无空洞。
 *
 * ## 仍然是指示意的那些
 *
 * `median-recurrent`（正中神经返支）**不在图谱数据里** —— 29 条里没有它，
 * 唯一候选的"肌支"按连通性拆开只是前臂中段 4 段 156 顶点的小残根。
 * 而它是腕管手术最需要知道的一条，不能没有。所以它保留本模型标定的示意走行，
 * 并在界面上明确标注来源 —— 一根示意混在 29 根图谱几何里，不标出来就是误导。
 *
 * ## 许可
 *
 * 图谱几何为 **CC BY-SA**：BodyParts3D（CC BY-SA 2.1 Japan）与
 * Z-Anatomy（CC BY-SA 4.0）。派生作品须以相同许可共享并署名。
 * 注意 Z-Anatomy 的 Zenodo 页面标的是 CC BY 4.0，那是错的，按更严的 BY-SA 处理。
 * 本项目的骨与肌用的是同一批派生数据，署名义务是既有的，不是这次新增的。
 */

/** 解剖分群 —— 面板分组与按群着色都用它 */
export type NerveGroupId = 'median' | 'ulnar' | 'radial' | 'cutaneous' | 'proximal'

export interface NerveGroupMeta {
  zh: string
  en: string
  /**
   * 分群用色。
   *
   * ⚠️ 选色有一条硬约束：**不能碰亮青 #22D3EE** —— 那是全局的选中／悬停色，
   * 任何群色只要落在这个色相上，「这条被选中了」与「这条属于尺系」就分不出来。
   * 同样避开的还有穴位青绿（#0F9B8E）、标本紫罗兰（#8B5CF6）、骨骼象牙白。
   *
   * 正中系直接用神经层的基准琥珀：它是这个项目里「神经」的颜色，
   * 让最常被讲的那一系守住基准色，其余各群往色相环上岔开。
   */
  color: string
}

export const NERVE_GROUPS: Record<NerveGroupId, NerveGroupMeta> = {
  median: { zh: '正中系', en: 'median', color: '#E0B13A' },
  ulnar: { zh: '尺系', en: 'ulnar', color: '#E06C9F' },
  radial: { zh: '桡系', en: 'radial', color: '#7FB069' },
  cutaneous: { zh: '皮神经', en: 'cutaneous', color: '#9AA3AD' },
  proximal: { zh: '近端神经干', en: 'proximal trunks', color: '#8FA8D8' },
}

export interface NerveDef {
  id: string
  zh: string
  en: string
  la: string
  /** 解剖分群 */
  group: NerveGroupId
  /**
   * 图谱几何的 FBX 对象名（Z-Anatomy PC-Version）。
   *
   * `null` = **没有图谱几何**，走本模型标定的示意路径（见 `path`）。
   * 界面上必须按这个字段区分「图谱几何」与「示意走行」，不允许混为一谈。
   */
  atlas: string | null
  /**
   * 示意走行的路径控制点（模型坐标 mm，近端 → 远端）。
   * 只有 `atlas === null` 时才存在 —— 有图谱几何的神经，屏幕上的管子
   * 完全由网格决定，不存在"路径"这回事。
   */
  path?: [number, number, number][]
  /** 示意管半径 mm（近端） */
  radius?: number
  /** 示意管远端半径 mm（不给则 ±10% 锥度） */
  radiusDistal?: number
  /**
   * 图谱几何之外、需要本模型示意补足的尾段（近端 → 远端）。
   *
   * 只有尺神经深支用到。图谱里它的几何止于 Z≈781（掌骨间），
   * 而它真正的终点在拇收肌与第 1 背侧骨间肌之间（Z≈753，合谷深层）——
   * 缺的恰好是最有临床意义的那 28mm。所以尾段按本模型实测补上，
   * 接口处给接缝标记，界面上照实写「此线以远为示意」。
   *
   * ⚠️ 这条与「正中神经返支整条示意」是两回事：那是**图谱里没有**这条神经，
   * 这是**图谱里有、但只画了一半**。两者的说明文字不能共用一套。
   */
  tailPath?: [number, number, number][]
  /**
   * 本段几何的**下游接续对象**（图谱把它们存成了各自独立的物体）。
   *
   * 这套图谱是按「一块一看得懂的解剖单位」切分的，不是按「一条神经」切的：
   * 主干在某处分出分支时，**主干就在那里被截断**，分支另立一个物体。
   * 实测证据很强 —— 把 A 的远端末点与 B 的近端末点比距离，下面这些对全都
   * 落在 0.00~1.36mm 以内，其中 8 对是精确 0.00mm（同一批顶点被两边共用），
   * 这不是巧合，是切刀留下的断面。
   *
   * ⚠️ 于是「这条神经到某处就没了」这句话**不能只看它自己的几何**：
   * 尺神经主干的几何止于腕上 36mm（手背支发出处），而它往下那段在
   * `ulnar-superficial` 名下 —— 神门、Guyon 管这些腕部内容全落在后者身上。
   * 界面上必须说清接续关系，否则用户会以为神经真的在那儿断了。
   *
   * 反过来，**不能**拿这个字段去推断「远端终点」：神经末点仍按自身几何算
   * （见 nervePoints.nerveTip），因为「支配某块肌肉的神经末梢在哪」问的是
   * 那一条几何自己走到了哪，跨对象拼接会把肌肉镜头带跑。
   */
  continuesAs?: string[]
  /** 临床 / 康复沟通要点 */
  note: string
}

/**
 * 30 条神经。
 *
 * 排序 = 面板展示顺序：按群聚拢，群内按解剖顺序（主干在前、分支在后，近端到远端）。
 * 这个顺序不是随手排的 —— 用户从上往下读时，读到的是「这一系从中枢到指尖怎么分叉」。
 */
export const NERVES: NerveDef[] = [
  /* ---------------------------------------------------------------- 正中系 */
  {
    id: 'median',
    continuesAs: ['median-digital'],
    zh: '正中神经',
    en: 'median nerve',
    la: 'nervus medianus',
    group: 'median',
    atlas: 'Median nerve.l',
    note: '经旋前圆肌两头之间入前臂，走在指浅/深屈肌之间，最后经腕管入手掌。支配桡侧 3½ 指感觉与大鱼际肌。腕管内受压即腕管综合征。',
  },
  {
    id: 'anterior-interosseous',
    zh: '骨间前神经',
    en: 'anterior interosseous nerve',
    la: 'nervus interosseus anterior',
    group: 'median',
    atlas: 'Anterior interosseous nerve of forearm.l',
    note: '自正中神经分出，贴骨间膜掌侧面下行，支配拇长屈肌、指深屈肌桡侧半与旋前方肌。卡压时典型表现为「捏指畸形」（OK 征无法完成），无感觉障碍。',
  },
  {
    id: 'median-palmar',
    zh: '正中神经 掌支',
    en: 'palmar branch of median nerve',
    la: 'ramus palmaris nervi mediani',
    group: 'median',
    atlas: 'Palmar branch of median nerve.l',
    note: '在腕横纹近侧自正中神经桡侧发出，**不经腕管**，穿腕横韧带浅面下行，支配大鱼际与掌心桡侧皮肤。临床价值全在「不经腕管」这四个字：腕管综合征时它支配的掌部皮肤感觉保留，而手指麻木 —— 用它可以把手腕处的压迫（腕管）与前臂/正中神经主干的问题分开。',
  },
  {
    id: 'median-digital',
    zh: '正中神经 指掌侧总神经',
    en: 'common palmar digital branches of median nerve',
    la: 'nn. digitales palmares communes nervi mediani',
    group: 'median',
    atlas: 'Common palmar digital branches of median nerve.l',
    note: '腕管出口后分出，走在掌浅弓深面，至掌指关节处再分为两条指掌侧固有神经。支配拇指、示指、中指及环指桡侧半的掌面感觉。',
  },
  {
    id: 'median-proper-digital',
    zh: '正中神经 指掌侧固有神经',
    en: 'proper palmar digital branches of median nerve',
    la: 'nn. digitales palmares proprii nervi mediani',
    group: 'median',
    atlas: 'Proper palmar digital branches of median nerve.l',
    note: '沿手指两侧走行至指尖，支配指腹与指节掌面皮肤。它是手腕以下最细的一级分支（直径约 1.5mm 量级），也是腕管综合征麻木症状最远端的落点 —— 「麻到指尖」麻的就是它。',
  },
  {
    id: 'median-muscular',
    zh: '正中神经 肌支',
    en: 'muscular branches of median nerve',
    la: 'rami musculares nervi mediani',
    group: 'median',
    atlas: 'Muscular branches of median nerve.l',
    note: '前臂段发出的运动支（旋前圆肌、桡侧腕屈肌、掌长肌、指浅屈肌等）。注意**图谱数据里这一条只到前臂中段**，不含返支：腕管手术最容易误伤的拇短展肌支不在其中，见「正中神经 返支」。',
  },
  {
    id: 'median-ulnar-communicans',
    zh: '正中-尺神经交通支',
    en: 'communicating branch of median nerve with ulnar nerve',
    la: 'ramus communicans cum nervo ulnari',
    group: 'median',
    atlas: '(Communicating branch of median nerve with ulnar nerve).l',
    note: '正中神经与尺神经在前臂或掌部之间的吻合支（含 Martin–Gruber 吻合与 Riche–Cannieu 吻合两类解剖基础）。**它常见存在而常被忽略**：有了它，尺神经损伤时正中神经可能代偿支配部分手内在肌，于是肌萎缩与肌电图表现对不上损伤平面。这是「按教科书描述推断、却与患者对不上」的常见原因之一。',
  },
  {
    id: 'median-recurrent',
    zh: '正中神经 返支',
    en: 'recurrent branch of median nerve',
    la: 'ramus recurrens nervi mediani',
    group: 'median',
    atlas: null,
    /*
     * 唯一一条保留示意几何的神经 —— 因为图谱数据里确实没有它。
     *
     * 三重核对过：① 29 个对象清单里没有；② 唯一像候选的「正中神经肌支」按三角面
     * 连通性拆开是 4 段共 156 顶点的小残根，全落在 Z 953–1009（前臂中段），而返支
     * 应在腕以远的 780–800；③ 正中神经主干在 Z 786–816 逐档横截面只有 1–2mm 宽，
     * 全程没有拐向鱼际的支。
     *
     * 路径按本模型实测：鱼际肌群在 X 263~302、Y −152~−122（掌侧），而该高度上的腕骨
     * （大多角骨、手舟骨）都压在鱼际肌的**背侧**，因此全程取 Y ≤ −135 即稳定走在骨面之前。
     */
    path: [
      [252, -131, 792], // 腕管出口（与正中神经共用终点）
      [257, -135, 789], // 出腕管，转向桡侧
      [263, -140, 788], // 跨过拇短屈肌浅头的浅面
      [269, -144, 790], // 返向近端
      [275, -147, 793], // 进入鱼际肌
      [281, -148, 797], // 拇短展肌 / 拇对掌肌
    ],
    radius: 1.1,
    note: '自正中神经出腕管处发出，向桡侧返折进入鱼际肌，支配拇短展肌、拇对掌肌与拇短屈肌浅头。**腕管切开减压时它是最容易被误伤的神经** —— 切口偏桡侧即可切断，导致术后大鱼际肌无力加重。它也是腕管综合征运动障碍的解剖基础。',
  },

  /* ------------------------------------------------------------------ 尺系 */
  {
    id: 'ulnar',
    continuesAs: ['ulnar-dorsal', 'ulnar-superficial'],
    zh: '尺神经',
    en: 'ulnar nerve',
    la: 'nervus ulnaris',
    group: 'ulnar',
    atlas: 'Ulnar nerve.l',
    note: '经内上髁后方尺神经沟（肘管）入前臂，沿尺侧腕屈肌深面下行，经 Guyon 管入手掌。肘部屈曲久压或肘管狭窄可致肘管综合征。\n⚠️ **图谱分段**：本段几何止于手背支发出处（腕上约 3.6cm），腕以远那一截由「尺神经 浅支」这条对象接着走 —— 神门、Guyon 管这些腕部内容说的都是它。所以本条在孤立显示时会看着「短了一截」，那是图谱切分，不是神经真断了。',
  },
  {
    id: 'ulnar-deep',
    zh: '尺神经 深支',
    en: 'deep branch of ulnar nerve',
    la: 'ramus profundus nervi ulnaris',
    group: 'ulnar',
    atlas: 'Deep branch of ulnar nerve.l',
    /*
     * 图谱几何止于 [275.9, −134.5, 781.2]（掌骨间），再往桡侧、往远端那 28mm 没有。
     * 补段起点逐字取图谱几何的实际末端，保证接缝处两段是同一个点 ——
     * 否则图上会看到两根管子差开一点点，像"断了"。
     *
     * ⚠️ 末段**刻意收敛到合谷针道下方**（针道 = X 284、Z 753，方向 −Y）。
     * 这条补段是示意，它的存在理由只有一个：回答「合谷这一针扎下去会碰到什么」。
     * 若让它按图谱末端的方向继续往桡侧飘，末点会落到 X 292 上 —— 偏离针道 7.2mm，
     * 图上就会看到神经从针旁擦过去，「针下 3mm 就是它」这句话当场不成立。
     * 旧实现（2026-09-15）的偏差是 0.92mm，所以这不是「更准」，是**回到原来的位置口径**。
     *
     * Y 也不取到最低：拇收肌横头的背面在 Y≈−133.4，管半径 1.1mm，
     * 贴太近会让管子扎进肌腹里（层次表要证的是「走在两肌**之间**」）。
     * 末点取 −131.6，距拇收肌背面 1.8mm、距第 1 背侧骨间肌深面 2.8mm，两侧都留开。
     */
    tailPath: [
      [275.9, -134.5, 781.2], // 接缝：图谱几何末端
      [279, -134.2, 772],
      [282, -133.4, 764],
      [283.6, -132.4, 757],
      [284.5, -131.6, 753], // 合谷深层：针道下方，走在两肌之间的间隙里
    ],
    radius: 1.1,
    note: '绕钩骨钩转向掌深部，横过手掌，支配小鱼际肌、骨间肌、第 3、4 蚓状肌与拇收肌。钩骨钩骨折或 Guyon 管内受压时表现为手内在肌无力、Froment 征阳性。它的终末走在拇收肌与第 1 背侧骨间肌之间 —— 这一点决定了合谷深层为什么归它管。',
  },
  {
    id: 'ulnar-superficial',
    continuesAs: ['ulnar-common-digital', 'ulnar-proper-digital'],
    zh: '尺神经 浅支',
    en: 'superficial branch of ulnar nerve',
    la: 'ramus superficialis nervi ulnaris',
    group: 'ulnar',
    atlas: 'Superficial branch of ulnar nerve.l',
    note: '⚠️ **图谱分段**：本段几何自手背支发出处（腕上约 3.6cm）起，穿过 Guyon 管、止于管内的浅／深支分岔处 —— 也就是说它**同时包含了前臂远段的主干**，比解剖学上严格的「浅支」长一截。真正分到小指与环指尺侧半掌面那部分，图谱并进了下游的「尺神经 指掌侧总神经／固有神经」两个对象。\n分两支：一支支配掌短肌与小鱼际皮肤，一支出指掌侧总神经到小指与环指尺侧半掌面 —— **纯感觉**。它与深支在 Guyon 管内分岔，因此 Guyon 管受压可表现为「纯运动」「纯感觉」或「混合」三型，取决于压在哪一段。',
  },
  {
    id: 'ulnar-dorsal',
    zh: '尺神经 手背支',
    en: 'dorsal branch of ulnar nerve',
    la: 'ramus dorsalis nervi ulnaris',
    group: 'ulnar',
    atlas: 'Dorsal branch of ulnar nerve.l',
    note: '自前臂下段（腕上约 5cm）尺神经发出，绕尺骨茎突背侧下行，支配手背尺侧 ⅓ 以及小指、环指的指背皮肤。关键在**发出高度**：它自腕上发出，因此尺神经在腕部（Guyon 管）受压时本区感觉保留，而肘部（肘管）受压时本区麻木 —— 用它可以把损伤平面从腕与肘之间区分开。',
  },
  {
    id: 'ulnar-palmar',
    zh: '尺神经 掌支',
    en: 'palmar branch of ulnar nerve',
    la: 'ramus palmaris nervi ulnaris',
    group: 'ulnar',
    atlas: 'Palmar branch of ulnar nerve.l',
    note: '在前臂远端自尺神经发出，穿尺侧腕屈肌与掌腱膜，支配小鱼际区皮肤。与正中神经掌支地位相当：它**不经 Guyon 管**，所以 Guyon 管受压时这一小块皮肤感觉保留。',
  },
  {
    id: 'ulnar-dorsal-digital',
    zh: '尺神经 指背神经',
    en: 'dorsal digital branches of ulnar nerve',
    la: 'rami digitales dorsales nervi ulnaris',
    group: 'ulnar',
    atlas: 'Dorsal digital branches of ulnar nerve.l',
    note: '手背支的终末分支，分布到小指两侧与环指尺侧的指背。注意手背的桡／尺分界**个体变异很大**，经典写的「桡侧 2½ 指对尺侧 1½ 指」在实测中常表现为两侧各 2½ 指。',
  },
  {
    id: 'ulnar-common-digital',
    zh: '尺神经 指掌侧总神经',
    en: 'common palmar digital branches of ulnar nerve',
    la: 'nn. digitales palmares communes nervi ulnaris',
    group: 'ulnar',
    atlas: 'Common palmar digital branches of ulnar nerve.l',
    note: '尺神经浅支在掌部分出的两支指掌侧总神经，分别走向第 4 指蹼与小指。它们是手内在肌之外的「纯感觉」末梢 —— 与深支对照起来讲，正好说明尺神经在掌部一分两路：一路管感觉（浅支），一路管运动（深支）。',
  },
  {
    id: 'ulnar-proper-digital',
    zh: '尺神经 指掌侧固有神经',
    en: 'proper palmar digital branches of ulnar nerve',
    la: 'nn. digitales palmares proprii nervi ulnaris',
    group: 'ulnar',
    atlas: 'Proper palmar digital branches of ulnar nerve.l',
    note: '沿小指与环指尺侧走行至指尖的终末支。与正中神经的指掌侧固有神经在环指处**交界**，而这条交界线在不同人身上落在环指的桡侧或尺侧 —— 这是手部感觉检查里最常见的"对不上图"的地方。',
  },
  {
    id: 'ulnar-muscular',
    zh: '尺神经 肌支',
    en: 'muscular branches of ulnar nerve',
    la: 'rami musculares nervi ulnaris',
    group: 'ulnar',
    atlas: 'Muscular branches of ulnar nerve.l',
    note: '尺神经在前臂与掌部发出的运动支（尺侧腕屈肌、指深屈肌尺侧半，以及深支沿途的诸肌）。单独看它是"又一根肌支"，它的价值在于把「尺神经在哪儿管运动」这条线画出来：肘上、前臂、腕部受压的表现各不相同。',
  },

  /* ------------------------------------------------------------------ 桡系 */
  {
    id: 'radial',
    continuesAs: ['radial-deep', 'radial-superficial'],
    zh: '桡神经',
    en: 'radial nerve',
    la: 'nervus radialis',
    group: 'radial',
    atlas: 'Radial nerve.l',
    note: '沿肱骨后方的桡神经沟下行，穿外侧肌间隔后走在肱肌与肱桡肌之间，于肘部分出浅支与深支。它在**分叉之前**发出分支支配肱桡肌、桡侧腕长伸肌与肘肌 —— 因此肱骨中段骨折（桡神经沟处）损伤时，这三块肌先无力，而骨间后神经单独卡压时它们不受累，这是区分损伤平面的关键。',
  },
  {
    id: 'radial-deep',
    zh: '桡神经 深支',
    en: 'deep branch of radial nerve',
    la: 'ramus profundus nervi radialis',
    group: 'radial',
    atlas: 'Deep branch of radial nerve.l',
    note: '在肘部分出后穿旋后肌 —— 穿肌处即著名的 **Frohse 腱弓**，是前臂最典型的神经卡压点之一。穿出后改称骨间后神经。它是全神经层里**唯一真正穿过肌肉走行**的一条（其余都走在肌间隙里），这个几何事实本身就是它容易被卡压的原因。',
  },
  {
    id: 'radial-superficial',
    zh: '桡神经 浅支',
    en: 'superficial branch of radial nerve',
    la: 'ramus superficialis nervi radialis',
    group: 'radial',
    atlas: 'Superficial branch of radial nerve.l',
    note: '沿肱桡肌深面下行，于前臂远端转向背侧，经鼻烟窝分布于手背桡侧与虎口区。它**不经腕管、也不经 Guyon 管**，因此尺神经受压时虎口区感觉保留 —— 这是与神经根／臂丛病变鉴别的要点。前臂远端该支位置表浅，戴手表过紧或局部受压即可致麻木（Wartenberg 综合征）。',
  },
  {
    id: 'posterior-interosseous',
    zh: '骨间后神经',
    en: 'posterior interosseous nerve',
    la: 'nervus interosseus posterior',
    group: 'radial',
    atlas: 'Posterior interosseous nerve of forearm.l',
    note: '桡神经深支穿过旋后肌近侧缘的 Frohse 腱弓后改称骨间后神经，贴骨间膜背侧下行支配前臂伸肌群。此处卡压表现为伸指无力、**无感觉障碍** —— 它已不含感觉纤维，这条「无感觉障碍」正是与桡神经主干病变鉴别的要点。',
  },
  {
    id: 'radial-dorsal-digital',
    zh: '桡神经 指背神经',
    en: 'dorsal digital branches of radial nerve',
    la: 'rami digitales dorsales nervi radialis',
    group: 'radial',
    atlas: 'Dorsal digital branches of radial nerve.l',
    note: '桡神经浅支的终末分支，分布到拇指、示指与中指桡侧的指背。示指背侧归它管 —— 而它不经腕管也不经 Guyon 管，所以正中或尺神经受压都不会影响示指背，这是与 C6 神经根病变鉴别时的要点。',
  },
  {
    id: 'radial-muscular',
    zh: '桡神经 肌支',
    en: 'muscular branches of radial nerve',
    la: 'rami musculares nervi radialis',
    group: 'radial',
    atlas: 'Muscular branches of radial nerve.l',
    note: '桡神经主干与深支沿途发出的运动支（肱三头肌、肱桡肌、桡侧腕伸肌群等）。临床症状里「垂腕」看的就是这一系：损伤在肱骨中段时垂腕、感觉也减退；只在骨间后神经时垂腕但感觉正常。',
  },

  /* ---------------------------------------------------------------- 皮神经 */
  {
    id: 'medial-antebrachial-cutaneous',
    continuesAs: ['mac-anterior', 'mac-posterior'],
    zh: '前臂内侧皮神经',
    en: 'medial antebrachial cutaneous nerve',
    la: 'nervus cutaneus antebrachii medialis',
    group: 'cutaneous',
    atlas: 'Medial antebrachial cutaneous nerve.l',
    note: '自臂丛内侧束发出，与肱静脉伴行，在前臂内侧皮下下行，支配前臂内侧（含内上髁周围）皮肤。它在肘部与**尺神经的关系很紧**：肘管手术的内侧切口常会碰到它，而它损伤后表现为前臂内侧麻木 —— 与尺神经损伤的麻木区部分重叠但更靠近端、不累及手。',
  },
  {
    id: 'mac-anterior',
    zh: '前臂内侧皮神经 前支',
    en: 'anterior branch of medial antebrachial cutaneous nerve',
    la: 'ramus anterior nervi cutanei antebrachii medialis',
    group: 'cutaneous',
    atlas: 'Anterior branch of medial antebrachial cutaneous nerve.l',
    note: '前臂内侧皮神经的前支，沿前臂**掌侧**内侧皮下下行，与前臂内侧皮神经后支一起覆盖前臂内侧面皮肤。',
  },
  {
    id: 'mac-posterior',
    zh: '前臂内侧皮神经 后支',
    en: 'posterior branch of medial antebrachial cutaneous nerve',
    la: 'ramus posterior nervi cutanei antebrachii medialis',
    group: 'cutaneous',
    atlas: 'Posterior branch of medial antebrachial cutaneous nerve.l',
    note: '前臂内侧皮神经的后支，转向**尺背侧**，支配前臂内侧偏后方的皮肤。注意它与前臂后皮神经的地盘在尺背侧相邻 —— 这一带正是「哪条神经」最容易被判错的地方。',
  },
  {
    id: 'lateral-antebrachial-cutaneous',
    zh: '前臂外侧皮神经',
    en: 'lateral antebrachial cutaneous nerve',
    la: 'nervus cutaneus antebrachii lateralis',
    group: 'cutaneous',
    atlas: 'Lateral antebrachial cutaneous nerve.l',
    note: '肌皮神经的终末支 —— 它穿出肱二头肌腱外侧后改称此名，沿前臂**桡侧**皮下下行。它是「肌皮神经损伤」唯一看得见的症状：肌皮神经本身只管屈肘（肱二头肌、肱肌），断裂时屈肘无力加前臂桡侧麻木，麻木这一段就是它。',
  },
  {
    id: 'posterior-antebrachial-cutaneous',
    zh: '前臂后皮神经',
    en: 'posterior antebrachial cutaneous nerve',
    la: 'nervus cutaneus antebrachii posterior',
    group: 'cutaneous',
    atlas: 'Posterior antebrachial cutaneous nerve.l',
    note: '在肱骨桡神经沟内自桡神经发出，穿肱三头肌外侧头与肱肌之间到前臂背面皮下。它**发出点很高**（还在上臂），所以肱骨中段骨折伤及桡神经沟时，它常常一并受累 —— 前臂背侧麻木反而成了判断损伤高度的线索。它也是最容易被忽略的一条：因为感觉区隐蔽，患者与医生都不常查。',
  },

  /* ------------------------------------------------------------------ 近端 */
  {
    id: 'axillary',
    zh: '腋神经',
    en: 'axillary nerve',
    la: 'nervus axillaris',
    group: 'proximal',
    atlas: 'Axillary nerve.l',
    note: '臂丛后束的分支，绕肱骨外科颈后方（四边孔）至三角肌深面，支配三角肌与小圆肌，并发出臂外侧上皮神经。肩关节前下脱位、肱骨外科颈骨折易伤及它，表现为**三角肌萎缩、肩外展无力**（抬臂起不来），而屈肘、伸腕正常。',
  },
  {
    id: 'musculocutaneous',
    continuesAs: ['lateral-antebrachial-cutaneous'],
    zh: '肌皮神经',
    en: 'musculocutaneous nerve',
    la: 'nervus musculocutaneus',
    group: 'proximal',
    atlas: 'Musculocutaneous nerve.l',
    note: '臂丛外侧束的分支，穿喙肱肌后走在肱二头肌与肱肌之间，支配肱二头肌、肱肌与喙肱肌，穿出后成为前臂外侧皮神经。损伤表现为**屈肘无力 + 前臂桡侧麻木**。它是「纯运动症状 + 一条皮神经」的典型：运动只丢屈肘，其余全在前臂外侧那一片皮肤上。',
  },
]

const BY_ID = new Map(NERVES.map((n) => [n.id, n]))

export function nerveDef(id: string): NerveDef | undefined {
  return BY_ID.get(id)
}

/** 有图谱几何的神经 id —— 界面用它区分「图谱几何」与「示意走行」 */
export const ATLAS_NERVE_IDS: string[] = NERVES.filter((n) => n.atlas).map((n) => n.id)

/** 只有示意走行的神经 id（当前只有正中神经返支一条） */
export const SCHEMATIC_NERVE_IDS: string[] = NERVES.filter((n) => !n.atlas).map((n) => n.id)

/** 按群分组后的清单，顺序即 NERVE_GROUPS 的书写顺序 */
export function nervesByGroup(): { group: NerveGroupId; meta: NerveGroupMeta; items: NerveDef[] }[] {
  return (Object.keys(NERVE_GROUPS) as NerveGroupId[]).map((g) => ({
    group: g,
    meta: NERVE_GROUPS[g],
    items: NERVES.filter((n) => n.group === g),
  }))
}

/** 神经层涉及的全部 mesh id（渲染层与剥离表共用） */
export const NERVE_IDS: string[] = NERVES.map((n) => n.id)

/**
 * 反向索引：**谁把这条神经接下去**。
 *
 * `continuesAs` 是单向写的（近端 → 远端），但界面上两侧都要说：
 * 选中主干时要写「远端接续：…」，选中分支时要写「近端来自：…」。
 * 手工再维护一张反向表必然漂移，所以由正向表推出来。
 */
export const NERVE_CONTINUES_FROM: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {}
  for (const n of NERVES) {
    for (const k of n.continuesAs ?? []) (out[k] ??= []).push(n.id)
  }
  return out
})()

/** 一条神经在图谱分段意义上的上下邻居 —— 只用于说明文字，不参与几何与镜头计算 */
export function nerveKin(id: string): { from: string[]; to: string[] } {
  const def = NERVES.find((n) => n.id === id)
  return { from: NERVE_CONTINUES_FROM[id] ?? [], to: def?.continuesAs ?? [] }
}
