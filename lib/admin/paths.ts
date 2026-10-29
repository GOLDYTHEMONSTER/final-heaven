/**
 * The admin area lives at /studio. Activity events written by the database
 * (activity_feed.link) still carry the old /admin addresses, which now 404,
 * so links read from there go through this before reaching the browser.
 */
export function studioLink(link: string | null): string | null {
  if (!link) return link
  return link.replace(/^\/admin(?=[/?#]|$)/, '/studio')
}
