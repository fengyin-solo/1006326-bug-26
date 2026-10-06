// 领域层公共工具：localStorage 持久化、日期与编号。与通用脚手架的 local-store 互不干扰。

export function readJSON<T>(key: string): T | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null
  }
  const raw = window.localStorage.getItem(key)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeJSON<T>(key: string, value: T): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(key, JSON.stringify(value))
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function todayISO(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function nowText(): string {
  const now = new Date()
  return `${todayISO()} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

export function addDaysISO(iso: string, days: number): string {
  if (!iso) {
    return ''
  }
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7)
}
