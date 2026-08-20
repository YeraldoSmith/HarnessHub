import type { Plugin } from '@harnesshub/types'

export interface PluginIconProps {
  plugin: Pick<Plugin, 'category' | 'name'>
  className?: string
}

function CategoryGlyph({ category }: { category: string }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.8,
  }

  if (category === 'Coding' || category === 'Developer Tools') {
    return <svg viewBox="0 0 24 24" {...common}><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></svg>
  }
  if (category === 'Browser') {
    return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="9" /><path d="M3 9h18M9 21c3-4 3-14 0-18M15 21c-3-4-3-14 0-18" /></svg>
  }
  if (category === 'Research') {
    return <svg viewBox="0 0 24 24" {...common}><circle cx="10" cy="10" r="6" /><path d="m14.5 14.5 5 5M10 7v6M7 10h6" /></svg>
  }
  if (category === 'Data') {
    return <svg viewBox="0 0 24 24" {...common}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" /></svg>
  }
  if (category === 'Automation') {
    return <svg viewBox="0 0 24 24" {...common}><path d="M4 7h11M15 4l3 3-3 3M20 17H9M9 14l-3 3 3 3" /></svg>
  }
  if (category === 'Productivity') {
    return <svg viewBox="0 0 24 24" {...common}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>
  }
  return <svg viewBox="0 0 24 24" {...common}><path d="m12 3 2.6 5.4L20 11l-5.4 2.6L12 19l-2.6-5.4L4 11l5.4-2.6Z" /></svg>
}

export function PluginIcon({ plugin, className = '' }: PluginIconProps) {
  return (
    <span
      aria-label={`${plugin.name} icon`}
      className={`hh-plugin-icon hh-plugin-icon--${plugin.category.toLowerCase().replace(/\s+/g, '-')} ${className}`.trim()}
      role="img"
    >
      <CategoryGlyph category={plugin.category} />
    </span>
  )
}
