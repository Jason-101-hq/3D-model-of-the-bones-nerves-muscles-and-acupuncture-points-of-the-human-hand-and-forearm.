import React from 'react'
import ReactDOM from 'react-dom/client'
import { useGLTF } from '@react-three/drei'
import App from './App'
import './index.css'

/*
 * DRACO 解码器一律走本机文件，不许出外网。
 *
 * 起因是一次「交接包断网测试」：把网络掐掉后，**肌肉整层消失**（实测画面差 6.86%，
 * 比关掉整个神经层造成的差异还大），控制台抛 `Failed to fetch`，
 * 而界面上一句提示都没有。
 *
 * 链路是这样的：`muscles.glb` 是 DRACO 压缩的（骨 / 神经 / 体表 / 标本都不是），
 * 而 drei 的 `useGLTF` 在没有显式指定解码器路径时用的是
 * `https://www.gstatic.com/draco/versioned/decoders/1.5.5/` —— 于是
 * 「能不能看到肌肉」被悄悄绑成了「这台机器能不能上外网」。
 *
 * 更坑的是它**不会以报错的形式暴露**：浏览器只是少画一层，页面打开一切正常，
 * 只是前臂空了一块。谁也不会往网络问题上想。
 *
 * 项目 `public/draco/` 里早就备好了这四个解码器文件，却没有任何一处指向它们
 * （白放的几百 KB）。这里设一次默认值，而不是在每个调用点传 `'/draco/'`：
 * 后者只要以后有人新写一个不带参数的 `useGLTF`，就会静默退回外网 ——
 * 这种回归不报错，只会在别人电脑上悄悄少一层肌肉。
 *
 * 路径前面拼 `import.meta.env.BASE_URL`：线上是 GitHub Pages 的子路径
 * （`/<repo>/draco/`），本地 dev 是 `/draco/`。写死成 `/draco/` 的话，
 * 部署到 Pages 后解码器同样 404 —— 又回到「肌肉整层静默消失」那条老路上。
 */
useGLTF.setDecoderPath(`${import.meta.env.BASE_URL}draco/`)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
