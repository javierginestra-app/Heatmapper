import { createContext, useContext, type ReactNode } from 'react';
import { type ProjectRepository } from '@/core';

export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

/** Device location lookup; throws an Error with a user-readable message on failure or denial. */
export interface Geolocator {
  currentPosition(): Promise<Coordinates>;
}

export interface ProjectsServices {
  readonly projects: ProjectRepository;
  readonly newId: () => string;
  readonly now: () => number;
  readonly geolocator: Geolocator;
}

const Context = createContext<ProjectsServices | null>(null);

export function ProjectsServicesProvider({ services, children }: { services: ProjectsServices; children: ReactNode }) {
  return <Context.Provider value={services}>{children}</Context.Provider>;
}

export function useProjectsServices(): ProjectsServices {
  const services = useContext(Context);
  if (!services) throw new Error('ProjectsServicesProvider is missing');
  return services;
}
