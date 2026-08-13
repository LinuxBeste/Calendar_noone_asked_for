import { registerPlugin } from './plugins'

const TAGS: { pattern: RegExp; icon: string; tint: string }[] = [
  { pattern: /\b(meeting|call|sync|standup|review|demo)\b/i, icon: '⚡', tint: '#1a73e8' },
  { pattern: /\b(birthday|geburtstag)\b/i, icon: '🎂', tint: '#d93025' },
  { pattern: /\b(holiday|vacation|urlaub|trip|travel|✈️)\b/i, icon: '✈️', tint: '#f4511e' },
  { pattern: /\b(workout|gym|run|running|yoga|⚽|🏋️|🏃)\b/i, icon: '🏋️', tint: '#188038' },
  { pattern: /\b(coffee|kaffee|lunch|essen)\b/i, icon: '☕', tint: '#e8710a' },
  { pattern: /\b(dentist|doctor|arzt|zahnarzt|⚕️)\b/i, icon: '🩺', tint: '#00acc1' }
]

registerPlugin({
  id: 'smart-tags',
  decorate(event) {
    const title = event.title ?? ''
    for (const tag of TAGS) {
      if (tag.pattern.test(title)) {
        return { icon: tag.icon, tint: tag.tint }
      }
    }
    return null
  }
})