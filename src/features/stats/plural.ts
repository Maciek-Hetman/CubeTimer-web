/** "1 solve", "12 solves", "1,336 solves". */
export function plural(count: number, word: string): string {
  return `${count.toLocaleString()} ${count === 1 ? word : `${word}s`}`
}
