export type IdentityBadgeKind =
  | 'founder'
  | 'official'
  | 'verified-developer'
  | 'moderator'
  | 'reviewer'

const labels: Record<IdentityBadgeKind, string> = {
  founder: '◆ Founder',
  official: '✓ Official',
  'verified-developer': '✓ Verified Developer',
  moderator: '◆ Moderator',
  reviewer: '✓ Reviewer',
}

export interface IdentityBadgeProps {
  kind: IdentityBadgeKind
}

export function IdentityBadge({ kind }: IdentityBadgeProps) {
  return <span className={`hh-identity-badge hh-identity-badge--${kind}`}>{labels[kind]}</span>
}
