import type { Calendar, Event, EventException, Reminder, User } from '@shared/types'

export const DEMO_TOKEN = 'demo-token'

export const demoUser: User = {
  id: 'demo-user',
  email: 'demo@calendar.app',
  name: 'Demo User',
  createdAt: new Date().toISOString()
}

export const demoCalendars: Calendar[] = [
  {
    id: 'c-work',
    name: 'Work',
    color: '#4285f4',
    description: 'Meetings, deadlines and focus time',
    visible: true,
    isDefault: true,
    role: 'owner',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'c-personal',
    name: 'Personal',
    color: '#f4b400',
    description: 'Life outside the office',
    visible: true,
    isDefault: false,
    role: 'owner',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'c-team',
    name: 'Team',
    color: '#0f9d58',
    visible: true,
    isDefault: false,
    role: 'owner',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'c-fitness',
    name: 'Fitness',
    color: '#a142f4',
    visible: true,
    isDefault: false,
    role: 'owner',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]

function at(days: number, hour: number, minute = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function atDuration(days: number, hour: number, minute: number, minutes: number): { startsAt: string; endsAt: string } {
  return { startsAt: at(days, hour, minute), endsAt: at(days, hour, minute + minutes) }
}

function allDay(days: number, count = 1): { startDate: string; endDate: string } {
  const s = new Date()
  s.setDate(s.getDate() + days)
  const e = new Date(s)
  e.setDate(e.getDate() + count - 1)
  return { startDate: s.toISOString().slice(0, 10), endDate: e.toISOString().slice(0, 10) }
}

let seedId = 0
function ev(partial: Omit<Event, 'id' | 'createdAt' | 'updatedAt' | 'busy'> & { busy?: boolean }): Event {
  seedId += 1
  const now = new Date().toISOString()
  return { id: `demo-event-${seedId}`, busy: true, createdAt: now, updatedAt: now, ...partial }
}

/**
 * Seed data covers a full day (07:30 – 22:30) and every major feature:
 * daily/weekly/monthly recurrences, weekend-only series, overlapping events
 * (2-way and 3-way), all-day and multi-day events, timed events spanning
 * multiple days, free (busy=false) slots, icons, locations, descriptions,
 * timezone-aware events and occurrence exceptions.
 */
export function seedEvents(): Event[] {
  return [
    ev({
      calendarId: 'c-fitness',
      title: 'Morning run',
      allDay: false,
      ...atDuration(0, 8, 0, 60),
      rrule: 'FREQ=WEEKLY;BYDAY=SA,SU;INTERVAL=1',
      color: '#a142f4',
      icon: '🏃',
      location: 'Riverside park',
      description: 'Easy 8k — listen to a podcast.'
    }),
    ev({
      calendarId: 'c-work',
      title: 'Daily standup',
      allDay: false,
      ...atDuration(0, 9, 0, 15),
      rrule: 'FREQ=DAILY;INTERVAL=1',
      color: '#4285f4',
      location: 'Conference Room A',
      description: "What did you do, what's next, any blockers?"
    }),
    ev({
      calendarId: 'c-personal',
      title: 'Coffee break',
      allDay: false,
      ...atDuration(0, 9, 45, 30),
      rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;INTERVAL=1',
      color: '#f4b400',
      icon: '☕',
      location: 'Kitchen'
    }),
    ev({
      calendarId: 'c-work',
      title: 'Deep work — focus block',
      allDay: false,
      ...atDuration(0, 10, 30, 90),
      rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;INTERVAL=1',
      busy: false,
      color: '#9aa0a6',
      icon: '🧠',
      description: 'No meetings please. Phone on silent.'
    }),
    ev({
      calendarId: 'c-personal',
      title: 'Dentist appointment',
      allDay: false,
      ...atDuration(3, 10, 0, 60),
      color: '#f4b400',
      location: 'City Dental',
      description: 'Remember to bring the insurance card.'
    }),
    ev({
      calendarId: 'c-personal',
      title: 'Lunch',
      allDay: false,
      ...atDuration(0, 12, 30, 45),
      rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;INTERVAL=1',
      color: '#f4b400',
      icon: '🍜',
      location: 'Canteen'
    }),
    ev({
      calendarId: 'c-team',
      title: 'Team sync',
      allDay: false,
      ...atDuration(0, 14, 0, 60),
      rrule: 'FREQ=WEEKLY;BYDAY=MO,TH;INTERVAL=1',
      color: '#0f9d58',
      location: 'Zoom',
      description: 'Weekly status + decisions log.'
    }),
    ev({
      calendarId: 'c-work',
      title: 'Vendor call',
      allDay: false,
      ...atDuration(0, 14, 0, 30),
      rrule: 'FREQ=WEEKLY;BYDAY=MO,TH;INTERVAL=1',
      color: '#4285f4',
      location: 'Zoom',
      description: 'Q3 pricing discussion.'
    }),
    ev({
      calendarId: 'c-work',
      title: 'Architecture review',
      allDay: false,
      ...atDuration(0, 14, 0, 60),
      rrule: 'FREQ=WEEKLY;BYDAY=TH;INTERVAL=1',
      color: '#4285f4',
      location: 'Meeting Room 1',
      description: 'Three overlapping meetings on Thu — see the side-by-side layout.'
    }),
    ev({
      calendarId: 'c-team',
      title: 'Design review',
      allDay: false,
      ...atDuration(0, 13, 30, 30),
      rrule: 'FREQ=WEEKLY;BYDAY=WE;INTERVAL=1',
      color: '#0f9d58',
      location: 'FigJam'
    }),
    ev({
      calendarId: 'c-personal',
      title: 'Afternoon walk',
      allDay: false,
      ...atDuration(0, 15, 0, 30),
      rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;INTERVAL=1',
      busy: false,
      color: '#9aa0a6',
      icon: '🚶',
      description: 'Fresh air, 15 min around the block.'
    }),
    ev({
      calendarId: 'c-work',
      title: 'Code review',
      allDay: false,
      ...atDuration(1, 15, 30, 30),
      color: '#4285f4',
      location: 'GitHub',
      description: 'PR #412 — settings refactor.'
    }),
    ev({
      calendarId: 'c-work',
      title: '1:1 with manager',
      allDay: false,
      ...atDuration(0, 11, 0, 30),
      rrule: 'FREQ=WEEKLY;BYDAY=FR;INTERVAL=1',
      color: '#4285f4',
      location: 'Zoom'
    }),
    ev({
      calendarId: 'c-team',
      title: 'Monthly retro',
      allDay: false,
      ...atDuration(8, 16, 0, 45),
      rrule: 'FREQ=MONTHLY;INTERVAL=1',
      color: '#0f9d58',
      location: 'Meeting Room 2',
      description: 'What went well / what could go better.'
    }),
    ev({
      calendarId: 'c-fitness',
      title: 'Workout',
      allDay: false,
      ...atDuration(0, 17, 30, 60),
      rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;INTERVAL=1',
      color: '#a142f4',
      icon: '🏋️',
      location: 'Gym',
      description: 'Push day. Log weights in the app.'
    }),
    ev({
      calendarId: 'c-fitness',
      title: 'Yoga class',
      allDay: false,
      ...atDuration(4, 19, 0, 60),
      color: '#a142f4',
      location: 'Studio 2',
      description: 'Bring your own mat.'
    }),
    ev({
      calendarId: 'c-personal',
      title: 'Dinner',
      allDay: false,
      ...atDuration(0, 19, 30, 45),
      rrule: 'FREQ=DAILY;INTERVAL=1',
      color: '#f4b400',
      icon: '🍽'
    }),
    ev({
      calendarId: 'c-personal',
      title: 'Movie night',
      allDay: false,
      ...atDuration(0, 21, 0, 90),
      rrule: 'FREQ=WEEKLY;BYDAY=FR,SA;INTERVAL=1',
      color: '#f4b400',
      icon: '🎬',
      location: 'Living room',
      description: 'Queue up a classic this time.'
    }),
    ev({
      calendarId: 'c-personal',
      title: 'Farmers market',
      allDay: false,
      ...atDuration(0, 10, 0, 90),
      rrule: 'FREQ=WEEKLY;BYDAY=SA;INTERVAL=1',
      color: '#f4b400',
      icon: '🛒',
      location: 'Main square'
    }),
    ev({
      calendarId: 'c-personal',
      title: 'Meal prep',
      allDay: false,
      ...atDuration(0, 17, 0, 60),
      rrule: 'FREQ=WEEKLY;BYDAY=SU;INTERVAL=1',
      color: '#f4b400',
      icon: '🥘',
      description: "Plan the week's lunches."
    }),
    ev({
      calendarId: 'c-personal',
      title: 'Birthday party',
      allDay: true,
      ...allDay(6),
      color: '#f4b400',
      icon: '🎉',
      description: "Sam's birthday — bring cake!"
    }),
    ev({
      calendarId: 'c-work',
      title: 'Project deadline',
      allDay: true,
      ...allDay(14),
      color: '#d93025',
      icon: '🚀',
      description: 'Milestone 1: ship the mobile version.'
    }),
    ev({
      calendarId: 'c-personal',
      title: 'Holiday — beach week',
      allDay: true,
      ...allDay(30, 5),
      color: '#f4b400',
      icon: '🏖',
      description: 'Vacation! Out of office.'
    }),
    ev({
      calendarId: 'c-work',
      title: 'Product conference',
      allDay: false,
      ...atDuration(10, 9, 0, 1920),
      color: '#4285f4',
      location: 'City Convention Center',
      timezone: 'Europe/Berlin',
      rruleTz: 'Europe/Berlin',
      description: 'Two-day conference, 09:00–17:00. Multi-day timed event.'
    }),
    ev({
      calendarId: 'c-team',
      title: 'Team offsite',
      allDay: true,
      ...allDay(12, 2),
      color: '#0f9d58',
      icon: '🧗',
      description: 'Overnight at the lake house.'
    })
  ]
}

/** A cancelled and a rescheduled occurrence of the daily standup. */
export function seedExceptions(): EventException[] {
  return [
    {
      id: 'demo-exception-1',
      eventId: 'demo-event-2',
      occurrence: at(1, 9, 0),
      deleted: true
    },
    {
      id: 'demo-exception-2',
      eventId: 'demo-event-2',
      occurrence: at(3, 9, 0),
      title: 'Standup (moved)',
      startsAt: at(3, 10, 30),
      endsAt: at(3, 10, 45),
      deleted: false
    }
  ]
}

export function seedReminders(events: Event[]): Reminder[] {
  const byId = (id: string): Event | undefined => events.find((e) => e.id === id)
  const list: Array<{ eventId: string; minutes: number }> = [
    { eventId: 'demo-event-3', minutes: 10 },
    { eventId: 'demo-event-4', minutes: 5 },
    { eventId: 'demo-event-5', minutes: 15 },
    { eventId: 'demo-event-5', minutes: 1440 },
    { eventId: 'demo-event-7', minutes: 10 },
    { eventId: 'demo-event-12', minutes: 15 },
    { eventId: 'demo-event-18', minutes: 30 },
    { eventId: 'demo-event-21', minutes: 10080 },
    { eventId: 'demo-event-22', minutes: 15 },
    { eventId: 'demo-event-23', minutes: 30 }
  ]
  let n = 0
  const out: Reminder[] = []
  for (const r of list) {
    if (!byId(r.eventId)) continue
    n += 1
    out.push({ id: `demo-reminder-${n}`, eventId: r.eventId, minutes: r.minutes })
  }
  return out
}
