// Calendar screen (screens/Calendar.tsx) — view tabs, stats strip, heatmap,
// day list, year overview, timeline. Month/weekday/date strings come from
// monthName()/weekdayName()/fmtDate(), never from a hardcoded array.
export const calendar = {
  'calendar.view.month': 'Month',
  'calendar.view.year': 'Year',
  'calendar.view.timeline': 'Timeline',
  'calendar.thisYear': 'This year',
  'calendar.previous': 'Previous',

  'calendar.stat.dayStreak': 'day streak',
  'calendar.stat.entries': 'entries',
  'calendar.stat.days': 'days',
  'calendar.stat.mostActive': 'most active',
  'calendar.stat.words': 'words',

  'calendar.nothingYet': 'Nothing yet',
  'calendar.thisSeason': 'This season',
  'calendar.onThisDay': 'On this day',
  'calendar.weeks#one': '{count} week',
  'calendar.weeks#other': '{count} weeks',
  'calendar.heatLess': 'less',
  'calendar.heatMore': 'more',
  'calendar.more#one': '+{count} more',
  'calendar.more#other': '+{count} more',
  'calendar.dayCount#one': '{date}: {count} entry',
  'calendar.dayCount#other': '{date}: {count} entries',

  'calendar.empty.day': 'No entries on this day.',
  'calendar.empty.write': 'Write something',
  'calendar.empty.timeline': 'No entries yet.',
  'calendar.empty.writeFirst': 'Write your first entry',
} as const;
