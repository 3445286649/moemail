const FIRST = [
  "austin", "mason", "logan", "carter", "nolan", "owen", "evan", "liam", "ethan", "lucas",
  "hazel", "violet", "claire", "nora", "elena", "mila", "sophie", "alice", "julia", "eva",
]

const LAST = [
  "king", "stone", "reed", "brook", "lane", "grant", "hayes", "porter", "bennett", "foster",
  "parker", "morgan", "ellis", "riley", "cooper", "bailey", "walker", "turner", "gray", "woods",
]

const WORDS = [
  "river", "north", "field", "ember", "cedar", "silver", "harbor", "meadow", "summit", "orbit",
  "maple", "prairie", "copper", "linden", "valley", "forest", "signal", "garden", "canvas", "anchor",
]

export type EmailNameMode = "human" | "numeric" | "prefix"

export function createEmailName(mode: EmailNameMode = "human", prefix = "") {
  const safePrefix = sanitizeEmailName(prefix)
  if (mode === "prefix" && safePrefix) {
    return `${safePrefix}${randomNumber(100, 9999)}`
  }

  if (mode === "numeric") {
    return `${safePrefix || "mail"}${randomNumber(100000, 999999)}`
  }

  const shape = randomNumber(0, 3)
  if (shape === 0) return `${pick(FIRST)}${pick(LAST)}${randomNumber(10, 999)}`
  if (shape === 1) return `${pick(WORDS)}.${pick(LAST)}${randomNumber(10, 99)}`
  if (shape === 2) return `${pick(FIRST)}_${pick(WORDS)}${randomNumber(100, 999)}`
  return `${pick(WORDS)}${pick(WORDS)}${randomNumber(10, 999)}`
}

export function sanitizeEmailName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/@.*$/, "")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 48)
}

function pick<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)]
}

function randomNumber(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
