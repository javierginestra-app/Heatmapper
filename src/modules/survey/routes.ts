import { type NativeStackScreenProps } from '@react-navigation/native-stack';
import { type MeasurementMode } from '@/core';

export interface SurveyRouteParams {
  readonly projectId: string;
  readonly locationId: string;
  readonly mode: MeasurementMode;
}

/** Routes owned by the survey module; the app registers them under these names. */
export type SurveyStackParamList = {
  Survey: SurveyRouteParams;
};

export type SurveyScreenProps = NativeStackScreenProps<SurveyStackParamList, 'Survey'>;
