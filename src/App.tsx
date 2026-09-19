import { useRef, useState } from 'react'
import * as THREE from 'three'
import Viewer from './Viewer'
import { ControlPanel, InfoCard } from './ui'
import { STRUCTURE_INDEX } from './data/anatomy'
import { useAtlas, VIEWS } from './store'

/** 画布上的视角工具条与操作提示 */
function ViewHud() {
  const viewKey = useAtlas((s) => s.viewKey)
  const setViewKey = useAtlas((s) => s.setViewKey)
  const request = useAtlas((s) => s.request)
  return (
    <div className="hud">
      <div className="vbar">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            title={v.en}
            className={viewKey === v.key ? 'v on' : 'v'}
            onClick={() => {
              setViewKey(v.key)
              request({ kind: 'view', key: v.key })
            }}
          >
            {v.zh}
          </button>
        ))}
        <button
          className="v"
          title="把前臂放平观察（也可按住 Shift 拖动自由翻滚）"
          onClick={() => request({ kind: 'roll', deg: 90 })}
        >
          横放
        </button>
        <button
          className="v"
          title="回到初始机位"
          onClick={() => {
            setViewKey(null)
            request({ kind: 'reset' })
          }}
        >
          复位
        </button>
      </div>
      <div className="tips">
        <span>左键拖动 旋转</span>
        <span>滚轮 缩放（对准指针）</span>
        <span>右键拖动 平移</span>
        <span>
          <b>Shift + 拖动 翻滚</b>
        </span>
        <span>
          <b>双击结构 聚焦放大</b>
        </span>
      </div>
    </div>
  )
}

/** 悬停结构的名称浮标。放大观察时用它确认「我指的是哪一块」 */
function HoverLabel() {
  const hovered = useAtlas((s) => s.hovered)
  const st = hovered ? STRUCTURE_INDEX.get(hovered) : null
  if (!st) return null
  return (
    <div className="hlabel">
      <b>{st.zh}</b>
      <span>{st.en}</span>
    </div>
  )
}

export default function App() {
  const centerRef = useRef<THREE.Vector3 | null>(null)
  const [range, setRange] = useState<[number, number]>([-3.5, 3.5])

  const onCenter = (
    _c: THREE.Vector3,
    min: THREE.Vector3,
    max: THREE.Vector3
  ) => {
    // 模型 Z 轴（近端-远端）在场景中映射到 Y 轴，剖切面沿此方向滑动
    setRange([(min.z - _c.z) * 0.01, (max.z - _c.z) * 0.01])
  }

  return (
    <div className="app">
      <div className="stage">
        <Viewer onCenter={onCenter} centerRef={centerRef} />
        <ViewHud />
        <HoverLabel />
        <InfoCard />
      </div>
      <ControlPanel clipRange={range} />
    </div>
  )
}
