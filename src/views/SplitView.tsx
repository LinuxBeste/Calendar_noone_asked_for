import { useCalendar } from '../store'
import MonthView from './MonthView'
import AgendaView from './AgendaView'

export default function SplitView({ date }: { date: Date }): React.JSX.Element {
  const { settings } = useCalendar()
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 min-h-0 overflow-hidden">
        <MonthView date={date} />
      </div>
      <div className="h-[42%] min-h-[180px] border-t border-gray-200 dark:border-gray-700">
        <AgendaView date={date} days={settings.agendaRangeDays} />
      </div>
    </div>
  )
}