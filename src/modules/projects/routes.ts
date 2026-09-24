import { type NativeStackScreenProps } from '@react-navigation/native-stack';
import { type SurveyRouteParams } from '@/modules/survey';

/** Routes owned by the projects module; the app registers them under these names. */
export type ProjectsStackParamList = {
  Projects: undefined;
  Project: { projectId: string; isNew?: boolean };
  Location: { projectId: string; locationId: string };
  /** Owned by the survey module; opened from a location. */
  Survey: SurveyRouteParams;
};

export type ProjectsScreenProps<Name extends keyof ProjectsStackParamList> = NativeStackScreenProps<
  ProjectsStackParamList,
  Name
>;
