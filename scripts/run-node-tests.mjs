import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { spawn } from 'node:child_process'

const root = process.cwd()
const testDir = join(root, 'test')

function collectTests(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectTests(fullPath))
      continue
    }

    if (entry.isFile() && (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx'))) {
      files.push(relative(root, fullPath))
    }
  }

  return files
}

let files = []
try {
  files = collectTests(testDir).sort()
} catch {
  console.error('Failed to read test directory:', testDir)
  process.exit(1)
}

if (files.length === 0) {
  console.error('No Node test files found matching test/**/*.test.ts or test/**/*.test.tsx')
  process.exit(1)
}

let reporter
const usage = 'Usage: node scripts/run-node-tests.mjs [--reporter=NAME|--reporter NAME|--test-reporter=NAME|--test-reporter NAME]'
const args = process.argv.slice(2)

function requireValue(flagName, value) {
  if (!value || value.startsWith('-')) {
    console.error(`Missing reporter value for ${flagName}`)
    console.error(usage)
    process.exit(2)
  }

  return value
}

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]

  if (arg === '--reporter' || arg === '--test-reporter') {
    reporter = requireValue(arg, args[i + 1])
    i += 1
    continue
  }

  if (arg.startsWith('--reporter=')) {
    reporter = requireValue('--reporter', arg.slice('--reporter='.length))
    continue
  }

  if (arg.startsWith('--test-reporter=')) {
    reporter = requireValue('--test-reporter', arg.slice('--test-reporter='.length))
    continue
  }

  console.error(`Unknown argument: ${arg}`)
  console.error(usage)
  process.exit(2)
}

const resolvedReporter = reporter ?? process.env.NODE_TEST_REPORTER ?? 'spec'
const nodeArgs = ['--import', 'tsx', '--test', `--test-reporter=${resolvedReporter}`, ...files]
console.log(`[run-node-tests] Spawning: ${process.execPath} ${nodeArgs.join(' ')}`)

const child = spawn(process.execPath, nodeArgs, { stdio: 'inherit' })
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
