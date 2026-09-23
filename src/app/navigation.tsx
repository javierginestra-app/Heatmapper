import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Pressable, Text } from 'react-native';
import {
  LocationScreen,
  ProjectListScreen,
  ProjectScreen,
  ProjectsServicesProvider,
  type ProjectsStackParamList,
} from '@/modules/projects';
import { colors } from '@/modules/ui';
import { CapabilitiesScreen } from './CapabilitiesScreen';
import { type Container } from './container';

type RootStackParamList = ProjectsStackParamList & { Capabilities: undefined };

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.background, card: colors.surface, text: colors.text, primary: colors.accent },
};

export function AppNavigation({ container }: { readonly container: Container }) {
  return (
    <ProjectsServicesProvider services={container}>
      <NavigationContainer theme={theme}>
        <Stack.Navigator>
          <Stack.Screen
            name="Projects"
            component={ProjectListScreen}
            options={({ navigation }) => ({
              title: 'Heat Mapper Live',
              headerRight: () => (
                <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Capabilities')} hitSlop={8}>
                  <Text style={{ color: colors.accent }}>Device</Text>
                </Pressable>
              ),
            })}
          />
          <Stack.Screen name="Project" component={ProjectScreen} options={{ title: '' }} />
          <Stack.Screen name="Location" component={LocationScreen} options={{ title: '' }} />
          <Stack.Screen name="Capabilities" options={{ title: 'Device capabilities' }}>
            {() => <CapabilitiesScreen container={container} />}
          </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
    </ProjectsServicesProvider>
  );
}
