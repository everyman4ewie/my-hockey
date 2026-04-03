#!/usr/bin/env node
/**
 * Проверка SMTP из корня проекта (читает .env).
 * Запуск: node scripts/smtp-verify.mjs
 * На VPS: cd /root/hockey && node scripts/smtp-verify.mjs
 */
import { config } from 'dotenv'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { formatSmtpError, verifyMailConnection, isResendConfigured } from '../server/mail.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
config({ path: join(root, '.env') })

try {
  await verifyMailConnection()
  if (isResendConfigured()) {
    console.log('Mail verify: OK (Resend API, исходящий SMTP с VPS не нужен)')
  } else {
    console.log('Mail verify: OK (SMTP)')
  }
} catch (err) {
  console.error('Mail verify: FAIL —', formatSmtpError(err))
  process.exit(1)
}
