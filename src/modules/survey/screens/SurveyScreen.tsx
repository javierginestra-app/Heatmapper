import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  resolveRssiTarget,
  type AppSettings,
  type MeasurementCapabilities,
  type MeasurementProvider,
  type TestScope,
} from '@/core';
import { normalizeEndpointUrl } from '@/modules/performance';
import { availabilityColor, Button, colors, Muted, Section, spacing, TextField } from '@/modules/ui';
import { PinBoard } from '../components/PinBoard';
import { readingRate, SurveyRecorder, type RecorderSnapshot } from '../recorder';
import {
  describeNetwork,
  formatAge,
  GAP_LABEL,
  parseByteCapMb,
  parseDimension,
  performanceLines,
  PROVIDER_STATE_LABEL,
  rssiView,
} from '../presentation';
import { type SurveyScreenProps } from '../routes';
import { useSurveyServices } from '../services';

const MODE_TITLE = { signal: 'Signal (RSSI) survey', performance: 'Performance survey' } as const;
const SCOPE_LABEL: Readonly<Record<TestScope, string>> = { local_network: 'Local network', internet: 'Internet' };
const TEST_TIME_LIMIT_MS = 60_000;
/** Android refreshes WifiInfo every few seconds; longer silence is recorded as a gap. */
const STALE_AFTER_MS = 5_000;

export function SurveyScreen({ navigation, route }: SurveyScreenProps) {
  const services = useSurveyServices();
  const { projectId, locationId, mode } = route.params;
  const provider: MeasurementProvider | null = mode === 'signal' ? services.signalProvider : services.performanceProvider;

  const [caps, setCaps] = useState<MeasurementCapabilities | null>(null);
  const [capsError, setCapsError] = useState<string | null>(null);
  const [targetDbm, setTargetDbm] = useState<number>(resolveRssiTarget(null));
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [snapshot, setSnapshot] = useState<RecorderSnapshot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [widthText, setWidthText] = useState('10');
  const [depthText, setDepthText] = useState('10');
  const [now, setNow] = useState(services.now());
  const recorderRef = useRef<SurveyRecorder | null>(null);

  useEffect(() => navigation.setOptions({ title: MODE_TITLE[mode] }), [navigation, mode]);

  useEffect(() => {
    provider
      ?.capabilities()
      .then(setCaps)
      .catch((e: unknown) => setCapsError(e instanceof Error ? e.message : String(e)));
    services.projects.getProject(projectId).then((p) => p && setTargetDbm(resolveRssiTarget(p.rssiTargetDbm)));
    services.settings.get().then(setSettings);
  }, [provider, services, projectId]);

  // Close the session when the screen goes away; pause when the app leaves the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') void recorderRef.current?.pause();
    });
    const tick = setInterval(() => {
      setNow(services.now());
      void recorderRef.current?.checkFreshness();
    }, 1_000);
    return () => {
      sub.remove();
      clearInterval(tick);
      void recorderRef.current?.finish();
    };
  }, [services]);

  const widthM = parseDimension(widthText);
  const depthM = parseDimension(depthText);

  async function start() {
    if (!provider) return;
    setMessage(null);
    try {
      const recorder = await SurveyRecorder.start(
        { surveys: services.surveys, provider, newId: services.newId, now: services.now, staleAfterMs: STALE_AFTER_MS },
        { projectId, locationId, mode },
      );
      recorderRef.current = recorder;
      setSnapshot(recorder.current);
      recorder.subscribe(setSnapshot);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  async function runTest(scope: TestScope) {
    const recorder = recorderRef.current;
    if (!recorder || !settings) return;
    const url = normalizeEndpointUrl(scope === 'local_network' ? settings.localTestEndpoint : settings.internetTestEndpoint);
    if (!url) return setMessage(`Set a ${SCOPE_LABEL[scope].toLowerCase()} endpoint first.`);
    setMessage(null);
    try {
      await recorder.runPerformanceTest({
        endpointId: url,
        scope,
        maxBytes: settings.performanceByteCapMb * 1_000_000,
        maxDurationMs: TEST_TIME_LIMIT_MS,
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  function finish() {
    Alert.alert('Finish this survey?', 'Recorded samples are kept. A finished session cannot be resumed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Finish', onPress: () => navigation.goBack() },
    ]);
  }

  const availability = provider ? caps?.availability : 'unsupported';
  const reason = provider ? (capsError ? `Detection failed: ${capsError}` : caps?.reason) : services.signalUnavailableReason;
  const canStart = provider !== null && availability === 'available';

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Source</Text>
          <Text style={[styles.status, { color: availabilityColor[availability ?? (capsError ? 'unknown' : 'not_implemented')] }]}>
            {availability ? availability.replace('_', ' ') : capsError ? 'unknown' : 'Checking…'}
          </Text>
          {reason ? <Muted>{reason}</Muted> : null}
        </View>

        {mode === 'performance' && settings && (
          <EndpointSettings settings={settings} onChange={setSettings} locked={snapshot?.testRunning != null} />
        )}

        {snapshot === null ? (
          <Button title="Start recording" onPress={start} disabled={!canStart || (mode === 'performance' && !settings)} />
        ) : (
          <>
            <LivePanel snapshot={snapshot} now={now} targetDbm={targetDbm} />

            <Section title="Your position">
              <Muted>
                {mode === 'signal'
                  ? 'Tap where you are standing. Readings are tagged with this point until you move it or clear it; readings without a point are kept without a position.'
                  : 'Tap where you are standing, then stay still until the test finishes. The app does not sense stillness; a result is discarded if the point moves during the test.'}
              </Muted>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <TextField label="Width (m)" value={widthText} onChangeText={setWidthText} keyboardType="decimal-pad" error={widthM ? null : '1–100'} />
                </View>
                <View style={styles.flex}>
                  <TextField label="Depth (m)" value={depthText} onChangeText={setDepthText} keyboardType="decimal-pad" error={depthM ? null : '1–100'} />
                </View>
              </View>
              {widthM && depthM ? (
                <PinBoard
                  widthM={widthM}
                  depthM={depthM}
                  pin={snapshot.pin}
                  placed={snapshot.placed}
                  disabled={snapshot.status !== 'recording' || snapshot.testRunning !== null}
                  onPlace={(pin) => void recorderRef.current?.setPin(pin)}
                />
              ) : null}
              <Muted>
                {snapshot.pin ? `Point: x ${snapshot.pin.x.toFixed(1)} m, z ${snapshot.pin.z.toFixed(1)} m` : 'No point marked.'}
              </Muted>
              {snapshot.pin && (
                <Button
                  title="Clear point (I'm walking)"
                  variant="secondary"
                  disabled={snapshot.testRunning !== null}
                  onPress={() => void recorderRef.current?.setPin(null)}
                />
              )}
            </Section>

            {mode === 'performance' && (
              <Section title="Tests">
                {(['local_network', 'internet'] as const).map((scope) => (
                  <View key={scope} style={styles.card}>
                    <Text style={styles.cardTitle}>{SCOPE_LABEL[scope]}</Text>
                    <PerformanceResult snapshot={snapshot} scope={scope} />
                    <Button
                      title={snapshot.testRunning === scope ? 'Testing… stay still' : `Run ${SCOPE_LABEL[scope].toLowerCase()} test here`}
                      onPress={() => void runTest(scope)}
                      disabled={snapshot.status !== 'recording' || snapshot.testRunning !== null || !snapshot.pin}
                    />
                  </View>
                ))}
              </Section>
            )}

            <View style={styles.row}>
              <View style={styles.flex}>
                {snapshot.status === 'paused' ? (
                  <Button title="Resume" onPress={() => void recorderRef.current?.resume()} />
                ) : (
                  <Button
                    title="Pause"
                    variant="secondary"
                    onPress={() => void recorderRef.current?.pause()}
                    disabled={snapshot.status !== 'recording' || snapshot.testRunning !== null}
                  />
                )}
              </View>
              <View style={styles.flex}>
                <Button title="Finish" variant="danger" onPress={finish} />
              </View>
            </View>
          </>
        )}
        {message ? <Text style={styles.error}>{message}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LivePanel({ snapshot, now, targetDbm }: { snapshot: RecorderSnapshot; now: number; targetDbm: number }) {
  const reading = snapshot.lastReading;
  const rssi = reading ? rssiView(reading, targetDbm) : null;
  const age = reading ? now - reading.collectedEndMs : null;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        {snapshot.status === 'recording' ? 'Recording' : snapshot.status === 'paused' ? 'Paused' : 'Finished'} ·{' '}
        {PROVIDER_STATE_LABEL[snapshot.providerState]}
      </Text>
      {snapshot.providerReason ? <Text style={styles.warning}>{snapshot.providerReason}</Text> : null}
      {snapshot.openGap ? <Text style={styles.warning}>Gap recorded: {GAP_LABEL[snapshot.openGap]}</Text> : null}
      {rssi && (
        <View style={styles.rssi}>
          <Text style={[styles.rssiValue, { color: rssi.color }]}>{rssi.value}</Text>
          <Text style={styles.body}>
            {rssi.label} · {rssi.meetsTarget ? `meets ${targetDbm} dBm target` : `below ${targetDbm} dBm target`}
          </Text>
          <Muted>Signal only; says nothing about internet speed.</Muted>
        </View>
      )}
      {reading && (
        <>
          <Muted>{describeNetwork(reading.network)}</Muted>
          <Muted>
            Latest reading {formatAge(age ?? 0)} · source {reading.source.providerId}
            {snapshot.mode === 'signal' ? ` · ${readingRate(snapshot.recentReceipts, now).toFixed(1)} new readings/s` : ''}
          </Muted>
        </>
      )}
      {!reading && snapshot.mode === 'signal' && <Muted>Waiting for a fresh reading…</Muted>}
      <Muted>
        {snapshot.accepted} saved · {snapshot.rejected} rejected · {snapshot.gapCount} gaps · {snapshot.seriesCount} series
      </Muted>
      {snapshot.lastRejection ? <Muted>Last rejection: {snapshot.lastRejection}</Muted> : null}
    </View>
  );
}

function PerformanceResult({ snapshot, scope }: { snapshot: RecorderSnapshot; scope: TestScope }) {
  const reading = snapshot.latestByScope[scope];
  if (!reading || reading.kind !== 'performance') return <Muted>No result yet.</Muted>;
  return (
    <View>
      {performanceLines(reading).map((line) => (
        <Muted key={line.label}>
          {line.label}: {line.value}
        </Muted>
      ))}
      <Muted>Endpoint: {reading.endpointId}</Muted>
    </View>
  );
}

function EndpointSettings(props: { settings: AppSettings; onChange: (s: AppSettings) => void; locked: boolean }) {
  const { settings: stored, onChange, locked } = props;
  const { settings: store } = useSurveyServices();
  const [local, setLocal] = useState(stored.localTestEndpoint);
  const [internet, setInternet] = useState(stored.internetTestEndpoint);
  const [cap, setCap] = useState(String(stored.performanceByteCapMb));
  const urlError = (text: string) => (text.trim() === '' || normalizeEndpointUrl(text) ? null : 'Use http://host:port or https://host');
  const capMb = parseByteCapMb(cap);

  async function save() {
    if (urlError(local) || urlError(internet) || capMb === null) return;
    onChange(await store.update({ localTestEndpoint: local.trim(), internetTestEndpoint: internet.trim(), performanceByteCapMb: capMb }));
  }

  return (
    <Section title="Endpoints">
      <Muted>
        Tests run against endpoints you own (see tools/perf-endpoint). Local network and internet are measured and reported
        separately, only on Wi-Fi.
      </Muted>
      <TextField label="Local network endpoint" value={local} onChangeText={setLocal} onBlur={save} editable={!locked}
        autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="http://192.168.1.10:8787" error={urlError(local)} />
      <TextField label="Internet endpoint" value={internet} onChangeText={setInternet} onBlur={save} editable={!locked}
        autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://perf.example.com" error={urlError(internet)} />
      <TextField label="Data cap per test (MB)" value={cap} onChangeText={setCap} onBlur={save} editable={!locked}
        keyboardType="number-pad" error={capMb === null ? 'Whole number from 1 to 100' : null} />
    </Section>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: spacing.md, gap: spacing.xs },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  status: { fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },
  body: { color: colors.text, fontSize: 15 },
  rssi: { gap: 2, marginVertical: spacing.xs },
  rssiValue: { fontSize: 40, fontWeight: '700' },
  warning: { color: '#F9A61C', fontSize: 13 },
  error: { color: colors.danger, fontSize: 14 },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
});
