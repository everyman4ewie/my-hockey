/** @vitest-environment node */
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { writeFileSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { hashPassword } from '../server/authCrypto.js'

let app

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hockey-api-'))
  process.env.HOCKEY_DATA_PATH = join(dir, 'data.json')
  process.env.HOCKEY_ADMIN_PATH = join(dir, 'admin.json')
  process.env.SESSION_SECRET = 'test-session-secret-32chars-minimum!!'
  process.env.NODE_ENV = 'test'

  const userPwd = hashPassword('testpass99')
  const data = {
    users: [
      {
        id: 'test-user-1',
        email: 'user@example.test',
        login: 'testuser',
        password: userPwd,
        isAdmin: false,
        tariff: 'free',
        accountRole: 'user',
        createdAt: new Date().toISOString()
      }
    ],
    plans: [],
    boards: [],
    videos: [],
    libraryItems: [],
    libraryFolders: [],
    organizations: []
  }
  writeFileSync(process.env.HOCKEY_DATA_PATH, JSON.stringify(data))

  const admin = {
    profile: { login: 'myadmin', email: 'admin@example.test', name: '' },
    password: hashPassword('adminpass99'),
    pages: { heroTitle: 'Test' }
  }
  writeFileSync(process.env.HOCKEY_ADMIN_PATH, JSON.stringify(admin))

  const mod = await import('../server/index.js')
  app = mod.app
})

describe('GET /api/tariffs', () => {
  it('returns purchasable tariffs for anonymous user', async () => {
    const res = await request(app).get('/api/tariffs').expect(200)
    expect(Array.isArray(res.body)).toBe(true)
    const ids = res.body.map((t) => t.id)
    expect(ids).toContain('free')
    expect(ids).toContain('pro')
    expect(ids).not.toContain('admin')
  })
})

describe('auth', () => {
  it('GET /api/auth/session without cookie → 401', async () => {
    await request(app).get('/api/auth/session').expect(401)
  })

  it('POST /api/auth/login wrong password → 401', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ login: 'testuser', password: 'wrongpassword' })
      .expect(401)
  })

  it('POST /api/auth/login valid user → 200 and session cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ login: 'testuser', password: 'testpass99' })
      .expect(200)
    expect(res.body.success).toBe(true)
    expect(res.body.user.login).toBe('testuser')
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('GET /api/auth/session with cookie → user', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ login: 'testuser', password: 'testpass99' })
    const cookie = loginRes.headers['set-cookie']
    const res = await request(app).get('/api/auth/session').set('Cookie', cookie).expect(200)
    expect(res.body.user.id).toBe('test-user-1')
    expect(res.body.user.login).toBe('testuser')
  })
})
