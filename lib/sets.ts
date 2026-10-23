// Sets: one product whose options are picks from groups, e.g. the Drop 01
// full set ("any 3 tees, 1 hoodie, 1 cap"). A set's `colors` list each choice
// as "Group: Choice", with "Group ×N: Choice" when N must be picked:
//   ["Tees ×3: Big Mark", "Tees ×3: Angel Wings", …, "Hoodie: Varsity 07", …, "Cap: Grey", …]
// A cart line's option is the picks, one group per part:
//   "Tees: Big Mark, Angel Wings, Ascend · Hoodie: Varsity 07 · Cap: Red"
// Checkout checks the picks against the groups, so a set needs no list of
// every combination and stays editable in admin.

export type SetGroup = { name: string; count: number; choices: string[] }

const OPTION = /^(.+?)(?: ×(\d+))?: (.+)$/

/** The groups of a set's options, in order; null when the options aren't a set's. */
export function setGroups(colors: string[]): SetGroup[] | null {
  if (!colors.length) return null
  const groups: SetGroup[] = []
  for (const c of colors) {
    const m = OPTION.exec(c)
    if (!m) return null
    const [, name, n, choice] = m
    let g = groups.find((x) => x.name === name)
    if (!g) groups.push((g = { name, count: Number(n ?? 1), choices: [] }))
    g.choices.push(choice)
  }
  return groups
}

/** The options a set's product carries, built from its groups. */
export const setColors = (groups: SetGroup[]) =>
  groups.flatMap((g) => g.choices.map((c) => `${g.name}${g.count > 1 ? ` ×${g.count}` : ''}: ${c}`))

/** A line's option from the picks, in the groups' own order so the same picks always read the same. */
export function formatSetPick(groups: SetGroup[], picks: Record<string, string[]>) {
  return groups.map((g) => `${g.name}: ${g.choices.filter((c) => picks[g.name]?.includes(c)).join(', ')}`).join(' · ')
}

/** True when a line's option picks exactly the right number of different, listed choices from every group. */
export function isValidSetPick(groups: SetGroup[], option: string | null | undefined) {
  if (!option) return false
  const parts = option.split(' · ')
  if (parts.length !== groups.length) return false
  return groups.every((g, i) => {
    const prefix = `${g.name}: `
    if (!parts[i].startsWith(prefix)) return false
    const picked = parts[i].slice(prefix.length).split(', ')
    return picked.length === g.count && new Set(picked).size === g.count && picked.every((p) => g.choices.includes(p))
  })
}
