import { type Availability } from '@/core';

export const colors = {
  background: '#0F1419',
  surface: '#1A2129',
  border: '#2A333D',
  text: '#E8EDF2',
  textMuted: '#9AA6B2',
  accent: '#3B9EFF',
  danger: '#ED1C24',
  success: '#16A84A',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const availabilityColor: Readonly<Record<Availability, string>> = {
  available: '#16A84A',
  unsupported: '#ED1C24',
  disabled: '#9AA6B2',
  not_implemented: '#F9A61C',
  unknown: '#F58220',
};
