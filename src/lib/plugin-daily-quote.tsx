import { registerPlugin } from './plugins'
import type { JSX } from 'react'

const QUOTES: { text: string; author: string }[] = [
  { text: 'The best way to predict the future is to create it.', author: 'Peter Drucker' },
  { text: 'Time you enjoy wasting is not wasted time.', author: 'Marthe Troly-Curtin' },
  { text: 'Everything you can imagine is real.', author: 'Pablo Picasso' },
  { text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt' },
  { text: 'Simplicity is the ultimate sophistication.', author: 'Leonardo da Vinci' },
  { text: 'Little by little, one travels far.', author: 'J.R.R. Tolkien' },
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'Quality is not an act, it is a habit.', author: 'Aristotle' },
  { text: 'Well begun is half done.', author: 'Aristotle' },
  { text: 'If you can dream it, you can do it.', author: 'Walt Disney' },
  { text: 'Believe you can and you are halfway there.', author: 'Theodore Roosevelt' },
  { text: 'It always seems impossible until it is done.', author: 'Nelson Mandela' },
  { text: 'Action is the foundational key to all success.', author: 'Pablo Picasso' },
  { text: 'The future belongs to those who prepare for it today.', author: 'Malcolm X' },
  { text: 'Whether you think you can or can’t, you’re right.', author: 'Henry Ford' },
  { text: 'The journey of a thousand miles begins with one step.', author: 'Lao Tzu' },
  { text: 'Turn your wounds into wisdom.', author: 'Oprah Winfrey' },
  { text: 'Every accomplishment starts with the decision to try.', author: 'John F. Kennedy' },
  { text: 'Start where you are. Use what you have. Do what you can.', author: 'Arthur Ashe' },
  { text: 'Dream big and dare to fail.', author: 'Norman Vaughan' }
]

function quoteOfTheDay(): { text: string; author: string } {
  const start = new Date(new Date().getFullYear(), 0, 0)
  const day = Math.floor((Date.now() - start.getTime()) / 86400000)
  return QUOTES[day % QUOTES.length]!
}

interface DailyQuoteWidgetProps {
  quote: { text: string; author: string }
}

function DailyQuoteWidget({ quote }: DailyQuoteWidgetProps): JSX.Element {
  return (
    <div className="px-3 py-3">
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-accent/10 to-transparent p-3">
        <p className="text-[13px] leading-snug text-gray-800 dark:text-gray-100">“{quote.text}”</p>
        <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">— {quote.author}</p>
        <p className="mt-1 text-[9px] uppercase tracking-wider text-accent/70">Daily Quote · test plugin</p>
      </div>
    </div>
  )
}

registerPlugin({
  id: 'daily-quote',
  renderWidget() {
    return <DailyQuoteWidget quote={quoteOfTheDay()} />
  }
})