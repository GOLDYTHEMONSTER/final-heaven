// Who is working the door on this request: Studio staff with events.checkin,
// or a helper whose phone holds a live door link (lib/events/store). Server only.
import 'server-only'
import { cookies } from 'next/headers'
import { getStaffContext, type StaffContext } from '@/lib/auth'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { DOOR_COOKIE, doorTicket, liveDoorLink, type DoorLink, type DoorResult } from './store'

export type DoorActor =
  | { kind: 'staff'; staff: StaffContext }
  | { kind: 'link'; link: DoorLink }

/** A door link on this phone wins over a staff session: the helper works one event. */
export async function doorActor(): Promise<DoorActor | null> {
  const link = await liveDoorLink(cookies().get(DOOR_COOKIE)?.value)
  if (link) return { kind: 'link', link }
  const staff = await getStaffContext().catch(() => null)
  return staff?.can('events.checkin') ? { kind: 'staff', staff } : null
}

/** Looks up or checks in a ticket as this actor. Staff see only their own tenant's tickets (public.door_ticket). */
export function doorAs(actor: DoorActor, ref: string, opts: { event?: string | null; checkIn?: boolean } = {}): Promise<DoorResult> {
  return actor.kind === 'link'
    ? doorTicket(createSupabaseServiceClient(), ref, { ...opts, door: actor.link.id })
    : doorTicket(actor.staff.supabase, ref, opts)
}
