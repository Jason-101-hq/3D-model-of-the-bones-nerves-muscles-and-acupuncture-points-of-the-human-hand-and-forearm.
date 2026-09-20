import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/*
 * GitHub Pages 的项目站点不在域名根目录，而在 https://<user>.github.io/<repo>/ 这条子路径下。
 *
 * 不设 base 的话 Vite 默认按根路径 `/` 生成引用，部署后 index.html 会去要
 * `/assets/xxx.js`、代码里也会去要 `/models/bones.glb` —— 全都在根路径上 404，
 * Pages 只回一个空白页，控制台一堆 404 但没有任何一处指向真正的原因。
 *
 * 所以构建时必须把 base 设成仓库子路径。仓库名以点号结尾（GitHub 上的真实名字就是这样），
 * 抄错一个字符就整站资源全挂，因此这里写成常量，只出现一次。
 *
 * dev（`npm run dev`）仍走根路径 `/`，本地开发地址不受影响；
 * `npm run preview` 会按同一条 base 预览，正好复现线上子路径的情况。
 */
const REPO_NAME = '3D-model-of-the-bones-nerves-muscles-and-acupuncture-points-of-the-human-hand-and-forearm.'
const PAGES_BASE = `/${REPO_NAME}/`

export default defineConfig(({ command }) => ({
  base: command === 'build' ? PAGES_BASE : '/',
  plugins: [react()],
  server: { port: 5173, host: true },
}))
