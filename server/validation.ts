import { z } from 'zod'
import type { CalendarInput, EventInput, ShareInput, ViewType } from '@shared/types'

/** Server-side input validation (Zod). All failures reject with a 400-status error. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export const LIMITS = {
  titleMax: 200,
  descriptionMax: 5000,
  locationMax: 500,
  nameMax: 100,
  emailMax: 254,
  passwordMin: 6,
  passwordMax: 128,
  searchMax: 50,
  searchQueryMax: 100,
  icalMaxBytes: 2 * 1024 * 1024,
  jsonMaxBytes: 20 * 1024 * 1024,
  rangeMaxDays: 365 * 25,
  dueWindowMax: 1440,
  eventDurationMaxMinutes: 365 * 24 * 60
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const COLOR_RE = /^#[0-9a-fA-F]{6}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const RRULE_RE = /^RRULE:FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;INTERVAL=\d{1,3})?(;UNTIL=\d{8}T\d{6}Z)?$/

function fromZod(schema: z.ZodType<unknown>): (input: unknown) => unknown {
  return (input: unknown) => {
    const result = schema.safeParse(input)
    if (!result.success) {
      const message = result.error.issues
        .map((i) => (i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message))
        .join('; ')
      throw new ValidationError(message || 'Invalid input')
    }
    return result.data
  }
}

// ---- primitives ----
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(LIMITS.emailMax)
  .refine((v) => EMAIL_RE.test(v), 'Invalid email address')
const nameSchema = z.string().trim().min(1).max(LIMITS.nameMax, `Name must be 1-${LIMITS.nameMax} characters`)
const passwordSchema = z.string().min(LIMITS.passwordMin).max(LIMITS.passwordMax, `Password must be between ${LIMITS.passwordMin} and ${LIMITS.passwordMax} characters`)
const idSchema = z.string().min(1).max(100)
const optionalText = (max: number, label: string) => z.string().max(max, `${label} must be at most ${max} characters`).optional()
const colorSchema = z.string().regex(COLOR_RE, 'expected #rrggbb')
const dateSchema = z.string().regex(DATE_RE, 'expected yyyy-MM-dd')
const isoTimestampSchema = z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), 'expected ISO timestamp')
const rruleSchema = z.string().regex(RRULE_RE, 'invalid recurrence rule')
const viewsSchema = z.enum(['day', 'week', 'month', 'year', 'agenda'])

// ---- auth ----
const registerSchema = z.object({ email: emailSchema, name: nameSchema, password: passwordSchema })
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, 'Password is required') })

// ---- calendars ----
const calendarSchema = z.object({
  name: nameSchema,
  color: colorSchema.or(z.literal('')).default(''),
  visible: z.boolean().default(true)
})
const calendarPatchSchema = z
  .object({
    name: nameSchema.optional(),
    color: colorSchema.or(z.literal('')).optional(),
    visible: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, 'Empty update payload')

// ---- events ----
const eventFields = {
  calendarId: idSchema,
  title: optionalText(LIMITS.titleMax, 'title'),
  description: optionalText(LIMITS.descriptionMax, 'description'),
  location: optionalText(LIMITS.locationMax, 'location'),
  color: colorSchema.or(z.literal('')).optional(),
  busy: z.boolean().optional(),
  rrule: rruleSchema.or(z.literal('')).optional(),
  icon: z.string().trim().max(24, 'Icon must be at most 24 characters').optional()
}

const titleRequiredSchema = z
  .string()
  .trim()
  .min(1, 'Title is required')
  .max(LIMITS.titleMax, `Title must be at most ${LIMITS.titleMax} characters`)

const eventRefine = (v: Record<string, unknown>, ctx: z.RefinementCtx): void => {
  if (v.allDay === true) {
    if (typeof v.startDate === 'string' && typeof v.endDate === 'string' && v.endDate < v.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'End date must not be before start date', path: ['endDate'] })
    }
    return
  }
  if (typeof v.startsAt === 'string' && typeof v.endsAt === 'string') {
    const start = new Date(v.startsAt).getTime()
    const end = new Date(v.endsAt).getTime()
    if (end <= start) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Event must end after it starts', path: ['endsAt'] })
      return
    }
    if (end - start > LIMITS.eventDurationMaxMinutes * 60000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Event duration is unreasonably long', path: ['endsAt'] })
    }
  }
}

const eventSchema = z
  .discriminatedUnion('allDay', [
    z.object({
      ...eventFields,
      title: titleRequiredSchema,
      allDay: z.literal(true),
      startDate: dateSchema,
      endDate: dateSchema
    }),
    z.object({
      ...eventFields,
      title: titleRequiredSchema,
      allDay: z.literal(false),
      startsAt: isoTimestampSchema,
      endsAt: isoTimestampSchema
    })
  ])
  .superRefine(eventRefine)

const eventPatchSchema = z
  .object({
    ...eventFields,
    calendarId: idSchema.optional(),
    title: titleRequiredSchema.optional(),
    allDay: z.boolean().optional(),
    startsAt: isoTimestampSchema.optional(),
    endsAt: isoTimestampSchema.optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional()
  })
  .superRefine(eventRefine)

// ---- sharing ----
const shareSchema = z.object({ email: emailSchema, role: z.enum(['viewer', 'editor']) })

// ---- settings whitelist ----
const settingSchemas: Record<string, z.ZodType<unknown>> = {
  firstDayOfWeek: z.union([z.literal(0), z.literal(1)]),
  timeFormat: z.enum(['24h', '12h']),
  defaultView: viewsSchema,
  workingHoursStart: z.number().int().min(0).max(24),
  workingHoursEnd: z.number().int().min(0).max(24),
  defaultEventDuration: z.number().int().min(5).max(1440),
  timezone: z.string().refine((tz) => Intl.supportedValuesOf('timeZone').includes(tz), 'Invalid timezone'),
  darkMode: z.enum(['light', 'dark', 'auto']),
  showWeekNumbers: z.boolean(),
  defaultReminderMinutes: z.union([z.literal(0), z.literal(5), z.literal(10), z.literal(30), z.literal(60), z.literal(1440)]),
  defaultCalendarId: z.string().max(64),
  secondaryTimezone: z.string().max(40),
  hideWeekends: z.boolean(),
  showHolidays: z.boolean(),
  holidaysCountry: z.string().max(4),
  accentColor: colorSchema,
  agendaRangeDays: z.number().int().min(1).max(90),
  monthMaxEvents: z.number().int().min(1).max(10)
}

// ---- misc ----
const rangeSchema = z
  .tuple([isoTimestampSchema, isoTimestampSchema])
  .superRefine(([from, to], ctx) => {
    const span = new Date(to).getTime() - new Date(from).getTime()
    if (span > LIMITS.rangeMaxDays * 86400000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Range too large (max ${LIMITS.rangeMaxDays} days)`, path: ['to'] })
    }
  })
const searchSchema = z.string().trim().min(1).max(LIMITS.searchQueryMax, `Search query must be 1-${LIMITS.searchQueryMax} characters`)
const limitSchema = z.number().int().min(1)
const dueWindowSchema = z.number().int().min(1)
const reminderMinutesSchema = z.number().int().min(0).max(24 * 60)

// ---- public API (throws ValidationError) ----
export const normalizeEmail = fromZod(emailSchema) as (email: string) => string
export function validatePassword(password: string): void {
  fromZod(passwordSchema)(password)
}
export function validateName(name: string): string {
  return fromZod(nameSchema)(name) as string
}
export function validateId(id: unknown, label = 'id'): string {
  try {
    return fromZod(idSchema)(id) as string
  } catch (err) {
    if (err instanceof ValidationError) throw new ValidationError(`Invalid ${label}`)
    throw err
  }
}

export function validateRange(from: string, to: string): void {
  fromZod(rangeSchema)([from, to])
}
export function validateSearchQuery(query: string): string {
  return fromZod(searchSchema)(query) as string
}
export function capLimit(limit: unknown): number | undefined {
  if (limit === undefined || limit === null) return undefined
  return Math.min(fromZod(limitSchema)(Number(limit)) as number, LIMITS.searchMax)
}
export function capDueWindow(window: unknown): number {
  return Math.min(fromZod(dueWindowSchema)(Number(window ?? 5)) as number, LIMITS.dueWindowMax)
}
export function validateReminderMinutes(minutes: unknown): number {
  return fromZod(reminderMinutesSchema)(Number(minutes)) as number
}
export function validateImportContent(content: unknown, maxBytes: number, label: string): string {
  if (typeof content !== 'string') throw new ValidationError(`${label} content must be a string`)
  if (Buffer.byteLength(content, 'utf8') > maxBytes) throw new ValidationError(`${label} content exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit`)
  return content
}

export function validateCalendarInput(input: unknown): CalendarInput {
  return fromZod(calendarSchema)(input) as CalendarInput
}
export function validateCalendarPatch(input: unknown): Partial<CalendarInput> {
  return fromZod(calendarPatchSchema)(input) as Partial<CalendarInput>
}
export function validateEventInput(input: unknown): EventInput {
  return fromZod(eventSchema)(input) as EventInput
}
export function validateEventPatch(input: unknown): Partial<EventInput> {
  return fromZod(eventPatchSchema)(input) as Partial<EventInput>
}
export function validateShareInput(input: unknown): ShareInput {
  return fromZod(shareSchema)(input) as ShareInput
}
export function validateSetting(key: string, value: unknown): { key: string; value: unknown } {
  const schema = settingSchemas[key]
  if (!schema) throw new ValidationError('Unknown setting key')
  return { key, value: fromZod(schema)(value) }
}
