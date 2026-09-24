import { createContext, useContext, type ReactNode } from 'react';
import { type MeasurementProvider, type ProjectRepository, type SettingsStore, type SurveyRepository } from '@/core';

export interface SurveyServices {
  readonly surveys: SurveyRepository;
  readonly projects: ProjectRepository;
  readonly settings: SettingsStore;
  /** Signal/RSSI source for this device, or null with the reason shown instead. */
  readonly signalProvider: MeasurementProvider | null;
  readonly signalUnavailableReason: string;
  readonly performanceProvider: MeasurementProvider | null;
  readonly newId: () => string;
  readonly now: () => number;
}

const Context = createContext<SurveyServices | null>(null);

export function SurveyServicesProvider({ services, children }: { services: SurveyServices; children: ReactNode }) {
  return <Context.Provider value={services}>{children}</Context.Provider>;
}

export function useSurveyServices(): SurveyServices {
  const services = useContext(Context);
  if (!services) throw new Error('SurveyServicesProvider is missing');
  return services;
}
