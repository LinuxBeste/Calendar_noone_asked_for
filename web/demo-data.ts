import type { Calendar, Event, Reminder, User } from '@shared/types'

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

export function seedEvents(): Event[] {
  return [
    ev({
      calendarId: 'c-work',
      title: 'Daily standup',
      allDay: false,
      ...atDuration(0, 9, 0, 15),
      rrule: 'FREQ=DAILY;INTERVAL=1',
      color: '#4285f4',
      location: 'Conference Room A'
    }),
    ev({
      calendarId: 'c-team',
      title: 'Team sync',
      allDay: false,
      ...atDuration(0, 14, 0, 60),
      rrule: 'FREQ=WEEKLY;BYDAY=MO,TH;INTERVAL=1',
      color: '#0f9d58',
      location: 'Zoom'
    }),
    ev({
      calendarId: 'c-fitness',
      title: 'Workout',
      allDay: false,
      ...atDuration(0, 18, 0, 60),
      rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;INTERVAL=1',
      color: '#a142f4',
      location: 'Gym'
    }),
    ev({
      calendarId: 'c-work',
      title: 'Code review',
      allDay: false,
      ...atDuration(1, 15, 30, 30),
      color: '#4285f4',
      location: 'GitHub'
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
      calendarId: 'c-team',
      title: 'Monthly retro',
      allDay: false,
      ...atDuration(8, 16, 0, 45),
      rrule: 'FREQ=MONTHLY;INTERVAL=1',
      color: '#0f9d58',
      location: 'Meeting Room 2'
    }),
    ev({
      calendarId: 'c-work',
      title: '1:1 with manager',
      allDay: false,
      ...atDuration(2, 11, 0, 30),
      rrule: 'FREQ=WEEKLY;BYDAY=FR;INTERVAL=1',
      color: '#4285f4',
      location: 'Zoom'
    }),
    ev({
      calendarId: 'c-fitness',
      title: 'Yoga class',
      allDay: false,
      ...atDuration(4, 19, 0, 60),
      color: '#a142f4',
      location: 'Studio 2'
    }),
    ev({
      calendarId: 'c-work',
      title: 'Focus time — no meetings',
      allDay: false,
      ...atDuration(0, 8, 0, 60),
      rrule: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;INTERVAL=1',
      busy: false,
      color: '#9aa0a6'
    })
  ]
}

export function seedReminders(events: Event[]): Reminder[] {
  const byId = (id: string): Event | undefined => events.find((e) => e.id === id)
  const list: Array<{ eventId: string; minutes: number }> = [
    { eventId: 'demo-event-4', minutes: 15 },
    { eventId: 'demo-event-4', minutes: 1440 },
    { eventId: 'demo-event-5', minutes: 1440 },
    { eventId: 'demo-event-6', minutes: 10080 },
    { eventId: 'demo-event-7', minutes: 15 },
    { eventId: 'demo-event-8', minutes: 30 }
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
