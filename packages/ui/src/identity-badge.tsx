import { useI18n, type TranslationKey } from '@harnesshub/i18n'

export type IdentityBadgeKind =
  | 'founder'
  | 'official'
  | 'verified-developer'
  | 'moderator'
  | 'reviewer'

const labelKeys: Record<IdentityBadgeKind, TranslationKey> = {
  founder: 'badge.founder',
  official: 'badge.official',
  'verified-developer': 'badge.verifiedDeveloper',
  moderator: 'badge.moderator',
  reviewer: 'badge.reviewer',
}

export interface IdentityBadgeProps {
  kind: IdentityBadgeKind
}

export function IdentityBadge({ kind }: IdentityBadgeProps) {
  const { t } = useI18n()
  return <span className={`hh-identity-badge hh-identity-badge--${kind}`}>{t(labelKeys[kind])}</span>
}
