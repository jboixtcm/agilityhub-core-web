/**
 * The registrants each class of a staff world holds (S08 R-08-19), by class id: allocated the first
 * time the class's world is read (`classBookingWorld`, `classBookingItems`) and kept, so a booking
 * keeps its dog and its id whatever happens to other classes (E7-W07 round 2 #3). The worlds they
 * were drawn from rebuild them: the calendar and the day grid (`resetPlanningState`) and the member
 * world, whose bookings count in the holds (`resetBookingState`). Nothing imported, so
 * `planning-handlers` resets it without importing the booking fixtures (no import cycle).
 */

/** A registrant of the staff reads: [member's first name, dog, the dog's sex]. */
export type Registrant = readonly [string, string, "FEMALE" | "MALE"];

/** A registrant a class holds: who, the row's index (its id and origin) and when they booked. */
export interface HeldRegistrant {
  bookedAt: string;
  index: number;
  person: Registrant;
}

/** A booking that counts in its class's booking week (R-08-02): its id and its dog. */
export interface CountedBooking {
  dogId: string;
  id: string;
}

/** A class's registrants: its bookings (ACTIVE, or CANCELLED_BY_CLUB once the club cancels it). */
export interface RegistrantAllocation {
  booked: HeldRegistrant[];
  /**
   * The class's bookings that count in its week (R-08-02), as of its world's last read: what the
   * club's one booking store adds up for a dog (INC-55 #3), the member world's limit included.
   */
  counted: CountedBooking[];
  /** The class as a booking of it reads elsewhere: its week (R-08-01), start and description. */
  session: { description: string; startsAt: string; startsAtLocal: string; weekKey: string };
  /** The 18:50 classes' late cancellation (the api's «any state»): it keeps CANCELLED_LATE. */
  late: HeldRegistrant | undefined;
}

export const registrantAllocations = new Map<string, RegistrantAllocation>();

/** Drops every class's registrants: the next read of each world allocates them again. */
export function resetRegistrantAllocations(): void {
  registrantAllocations.clear();
}
