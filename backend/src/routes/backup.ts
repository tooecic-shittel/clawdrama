// 临时迁移用：管理员导出 data 目录（SQLite 库 + 媒体）。迁移完成后删除本文件 + index.ts 的挂载。
import { Hono } from 'hono'
import { spawn, execSync } from 'child_process'
import { Readable } from 'stream'
import path from 'path'
import { fileURLToPath } from 'url'

const app = new Hono()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : path.resolve(__dirname, '../../../data')

function isAdmin(c: any) { return (c.get('user') as any)?.role === 'admin' }

// 大小概览
app.get('/info', (c) => {
  if (!isAdmin(c)) return c.json({ error: 'admin only' }, 403)
  try {
    const out = execSync(
      `echo "DATA_DIR=${DATA_DIR}"; du -sh "${DATA_DIR}" 2>/dev/null; echo "--- db ---"; ls -la "${DATA_DIR}"/*.db* 2>/dev/null; echo "--- static ---"; du -sh "${DATA_DIR}/static" 2>/dev/null`,
      { shell: '/bin/bash' as any },
    ).toString()
    return c.text(out)
  } catch (e: any) { return c.text(String(e?.message || e), 500) }
})

// 导出 tar.gz。?db_only=1 只导库（小、快）；否则库+媒体全导。
app.get('/export', (c) => {
  if (!isAdmin(c)) return c.json({ error: 'admin only' }, 403)
  const dbOnly = c.req.query('db_only') === '1'
  const args = dbOnly
    ? ['czf', '-', '-C', DATA_DIR, '--exclude=static', '.']
    : ['czf', '-', '-C', DATA_DIR, '.']
  const child = spawn('tar', args)
  child.on('error', () => {})
  return new Response(Readable.toWeb(child.stdout) as any, {
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="claw-backup${dbOnly ? '-db' : '-full'}.tar.gz"`,
    },
  })
})

export default app
