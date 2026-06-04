import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';

const API_BASE = 'https://b7mshalko4.execute-api.us-east-1.amazonaws.com/dev';
const TOKEN_KEY = 'safecheck_token';
const TABS = ['Scan', 'Inventory', 'Community', 'Profile'];

export default function App() {
  const [tab, setTab] = useState('Scan');
  const [token, setToken] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [scanInput, setScanInput] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [inventorySummary, setInventorySummary] = useState({ total: 0, recalled: 0, warning: 0, safe: 0 });
  const [community, setCommunity] = useState([]);
  const [points, setPoints] = useState({ totalPoints: 0, tier: 'Scout', pointsToNextTier: null, nextTier: null, rewards: [] });
  const [loadingTab, setLoadingTab] = useState(false);

  const loggedIn = !!token;

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(TOKEN_KEY);
      if (saved) setToken(saved);
    })();
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    if (tab === 'Inventory') loadInventory();
    if (tab === 'Community') loadCommunity();
    if (tab === 'Profile') loadPoints();
  }, [tab, loggedIn]);

  const scoreLabel = useMemo(() => `${points.totalPoints || 0} pts`, [points.totalPoints]);

  async function api(path, options = {}) {
    const headers = {
      ...(options.headers || {}),
    };

    if (token) headers.Authorization = token;

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
    return data;
  }

  async function registerUser() {
    if (!email || !password) return Alert.alert('Missing info', 'Enter email and password.');
    try {
      setAuthBusy(true);
      const data = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }).then((r) => r.json());
      if (data.error) throw new Error(data.error);
      Alert.alert('Registered', 'Account created. Now log in.');
    } catch (err) {
      Alert.alert('Register failed', err.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function loginUser() {
    if (!email || !password) return Alert.alert('Missing info', 'Enter email and password.');
    try {
      setAuthBusy(true);
      const data = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }).then((r) => r.json());
      if (!data.token) throw new Error(data.error || 'No token returned');
      await AsyncStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setTab('Scan');
      Alert.alert('Success', 'Logged in.');
    } catch (err) {
      Alert.alert('Login failed', err.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function logoutUser() {
    await AsyncStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setScanResult(null);
    setInventory([]);
    setCommunity([]);
    setPoints({ totalPoints: 0, tier: 'Scout', pointsToNextTier: null, nextTier: null, rewards: [] });
  }

  async function submitScan() {
    if (!loggedIn) return Alert.alert('Login required', 'Log in first.');
    if (!scanInput.trim()) return Alert.alert('Missing input', 'Enter a barcode or product name.');
    try {
      setScanBusy(true);
      const data = await api('/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: scanInput.trim(), productName: scanInput.trim() }),
      });
      setScanResult(data);
    } catch (err) {
      Alert.alert('Scan failed', err.message);
    } finally {
      setScanBusy(false);
    }
  }

  async function addScanToInventory() {
    if (!scanResult) return;
    try {
      await api('/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: scanResult.productName,
          barcode: scanResult.barcode,
          status: scanResult.status,
          cpscData: scanResult,
          emoji: scanResult.status === 'recalled' ? '⚠️' : scanResult.status === 'safe' ? '✅' : '📦',
        }),
      });
      Alert.alert('Added', 'Item added to inventory.');
      loadInventory();
    } catch (err) {
      Alert.alert('Add failed', err.message);
    }
  }

  async function loadInventory() {
    try {
      setLoadingTab(true);
      const data = await api('/inventory');
      setInventory(data.items || []);
      setInventorySummary(data.summary || { total: 0, recalled: 0, warning: 0, safe: 0 });
    } catch (err) {
      Alert.alert('Inventory error', err.message);
    } finally {
      setLoadingTab(false);
    }
  }

  async function deleteInventoryItem(itemId) {
    try {
      await api('/inventory', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      loadInventory();
    } catch (err) {
      Alert.alert('Delete failed', err.message);
    }
  }

  async function loadCommunity() {
    try {
      setLoadingTab(true);
      const data = await api('/community');
      setCommunity(data.posts || []);
    } catch (err) {
      Alert.alert('Community error', err.message);
    } finally {
      setLoadingTab(false);
    }
  }

  async function createCommunityPost() {
    Alert.prompt?.('New Report', 'Title', async (title) => {
      if (!title) return;
      Alert.prompt?.('New Report', 'Describe the issue', async (body) => {
        if (!body) return;
        try {
          await api('/community', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, body, hazardTag: 'other' }),
          });
          loadCommunity();
          loadPoints();
        } catch (err) {
          Alert.alert('Post failed', err.message);
        }
      });
    });
    if (!Alert.prompt) {
      Alert.alert('Note', 'Alert.prompt works on iOS. For Android, edit createCommunityPost in App.js to use local form fields.');
    }
  }

  async function loadPoints() {
    try {
      setLoadingTab(true);
      const data = await api('/points');
      setPoints(data);
    } catch (err) {
      Alert.alert('Points error', err.message);
    } finally {
      setLoadingTab(false);
    }
  }

  function renderTabContent() {
    if (!loggedIn) {
      return (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Login</Text>
          <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor="#8b949e" style={styles.input} autoCapitalize="none" />
          <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor="#8b949e" style={styles.input} secureTextEntry />
          <View style={styles.rowGap}>
            <TouchableOpacity style={styles.primaryBtn} onPress={loginUser} disabled={authBusy}>
              <Text style={styles.primaryBtnText}>{authBusy ? 'Working...' : 'Login'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={registerUser} disabled={authBusy}>
              <Text style={styles.secondaryBtnText}>Register</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (tab === 'Scan') {
      return (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Scan Product</Text>
            <TextInput value={scanInput} onChangeText={setScanInput} placeholder="Enter barcode or product name" placeholderTextColor="#8b949e" style={styles.input} />
            <TouchableOpacity style={styles.primaryBtn} onPress={submitScan} disabled={scanBusy}>
              <Text style={styles.primaryBtnText}>{scanBusy ? 'Checking...' : 'Check Product'}</Text>
            </TouchableOpacity>
          </View>

          {scanResult ? (
            <View style={styles.card}>
              <Text style={styles.bigEmoji}>{scanResult.status === 'recalled' ? '⚠️' : scanResult.status === 'safe' ? '✅' : '📦'}</Text>
              <Text style={styles.itemTitle}>{scanResult.productName || 'Unknown Product'}</Text>
              <Text style={styles.badge(scanResult.status)}>{String(scanResult.status || 'unknown').toUpperCase()}</Text>
              <Text style={styles.muted}>{scanResult.message || 'Scan complete'}</Text>
              {!!scanResult.hazard && <Text style={styles.detail}><Text style={styles.detailLabel}>Hazard: </Text>{scanResult.hazard}</Text>}
              {!!scanResult.remedy && <Text style={styles.detail}><Text style={styles.detailLabel}>Remedy: </Text>{scanResult.remedy}</Text>}
              {!!scanResult.recallDate && <Text style={styles.detail}><Text style={styles.detailLabel}>Recall Date: </Text>{scanResult.recallDate}</Text>}
              <TouchableOpacity style={styles.primaryBtn} onPress={addScanToInventory}>
                <Text style={styles.primaryBtnText}>Add to Inventory</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
      );
    }

    if (tab === 'Inventory') {
      return (
        <View style={styles.flex1}>
          <View style={styles.summaryRow}>
            <Metric label="Tracked" value={inventorySummary.total} />
            <Metric label="Recalled" value={inventorySummary.recalled} />
            <Metric label="Warning" value={inventorySummary.warning} />
            <Metric label="Safe" value={inventorySummary.safe} />
          </View>
          {loadingTab ? <ActivityIndicator color="#f0b429" /> : (
            <FlatList
              data={inventory}
              keyExtractor={(item) => item.itemId}
              contentContainerStyle={styles.listPad}
              renderItem={({ item }) => (
                <View style={styles.listCard}>
                  <View style={styles.listMain}>
                    <Text style={styles.listEmoji}>{item.emoji || '📦'}</Text>
                    <View style={styles.listTextWrap}>
                      <Text style={styles.listTitle}>{item.productName}</Text>
                      <Text style={styles.listMeta}>{item.barcode || item.itemId}</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => deleteInventoryItem(item.itemId)}>
                    <Text style={styles.smallBtnText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>No items yet.</Text>}
            />
          )}
        </View>
      );
    }

    if (tab === 'Community') {
      return (
        <View style={styles.flex1}>
          <TouchableOpacity style={styles.primaryBtn} onPress={createCommunityPost}>
            <Text style={styles.primaryBtnText}>New Report</Text>
          </TouchableOpacity>
          {loadingTab ? <ActivityIndicator color="#f0b429" style={styles.spaceTop} /> : (
            <FlatList
              data={community}
              keyExtractor={(item) => item.postId}
              contentContainerStyle={styles.listPad}
              renderItem={({ item }) => (
                <View style={styles.postCard}>
                  <Text style={styles.postTag}>{item.hazardTag || 'other'}</Text>
                  <Text style={styles.postTitle}>{item.title}</Text>
                  <Text style={styles.postBody}>{item.body}</Text>
                  <Text style={styles.postMeta}>{item.authorName || 'Anonymous'} · {item.votes || 0} votes</Text>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>No posts yet.</Text>}
            />
          )}
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Profile & Rewards</Text>
          <Text style={styles.profilePoints}>{points.totalPoints || 0} pts</Text>
          <Text style={styles.muted}>{points.tier || 'Scout'} · {points.pointsToNextTier ?? 0} to {points.nextTier || 'max tier'}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Rewards</Text>
          {(points.rewards || []).map((reward) => (
            <View key={reward.id} style={styles.rewardRow}>
              <View style={styles.flex1}>
                <Text style={styles.rewardTitle}>{reward.name}</Text>
                <Text style={styles.rewardMeta}>{reward.cost} pts · {reward.tier}</Text>
              </View>
              <Text style={styles.rewardState}>{reward.canAfford ? 'Can afford' : reward.unlocked ? 'Unlocked' : 'Locked'}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity style={styles.secondaryBtn} onPress={logoutUser}>
          <Text style={styles.secondaryBtnText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <Text style={styles.clock}>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        <View style={styles.scorePill}><Text style={styles.scorePillText}>{scoreLabel}</Text></View>
      </View>
      <View style={styles.header}>
        <Text style={styles.logo}>Safe<Text style={styles.logoAccent}>Check</Text></Text>
        <Text style={styles.headerBadge}>{loggedIn ? 'LIVE' : 'AUTH'}</Text>
      </View>
      {loggedIn && (
        <View style={styles.nav}>
          {TABS.map((t) => (
            <TouchableOpacity key={t} style={[styles.navBtn, tab === t && styles.navBtnActive]} onPress={() => setTab(t)}>
              <Text style={[styles.navText, tab === t && styles.navTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={styles.content}>{renderTabContent()}</View>
    </SafeAreaView>
  );
}

function Metric({ label, value }) {
  return (
    <View style={styles.metricBox}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
    paddingTop: 10,
  },
  flex1: { flex: 1 },
  scrollContent: { paddingBottom: 24, gap: 12 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  clock: {
    color: '#8b949e',
    fontSize: 11,
  },
  scorePill: {
    borderWidth: 1,
    borderColor: 'rgba(240,180,41,0.4)',
    backgroundColor: 'rgba(240,180,41,0.1)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  scorePillText: { color: '#f0b429', fontSize: 11, fontWeight: '600' },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: { color: '#e6edf3', fontSize: 24, fontWeight: '800' },
  logoAccent: { color: '#f0b429' },
  headerBadge: {
    color: '#f0b429',
    borderWidth: 1,
    borderColor: 'rgba(240,180,41,0.35)',
    backgroundColor: 'rgba(240,180,41,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '600',
  },
  nav: {
    flexDirection: 'row',
    backgroundColor: '#161b22',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  navBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  navBtnActive: { backgroundColor: '#30363d' },
  navText: { color: '#8b949e', fontSize: 12, fontWeight: '600' },
  navTextActive: { color: '#e6edf3' },
  content: { flex: 1, padding: 16 },
  card: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  sectionTitle: { color: '#8b949e', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.4 },
  input: {
    backgroundColor: '#21262d',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    color: '#e6edf3',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  rowGap: { flexDirection: 'row', gap: 10 },
  primaryBtn: {
    backgroundColor: '#f0b429',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 2,
  },
  primaryBtnText: { color: '#0d1117', fontWeight: '700' },
  secondaryBtn: {
    backgroundColor: '#21262d',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
  },
  secondaryBtnText: { color: '#e6edf3', fontWeight: '600' },
  bigEmoji: { fontSize: 40 },
  itemTitle: { color: '#e6edf3', fontSize: 22, fontWeight: '800' },
  muted: { color: '#8b949e', lineHeight: 20 },
  detail: { color: '#e6edf3', lineHeight: 21 },
  detailLabel: { fontWeight: '700' },
  badge: (status) => ({
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    color: '#fff',
    fontWeight: '700',
    backgroundColor:
      status === 'recalled' ? '#e85555' : status === 'safe' ? '#3fb68b' : '#f0814a',
  }),
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  metricBox: {
    flex: 1,
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  metricValue: { color: '#e6edf3', fontSize: 20, fontWeight: '800' },
  metricLabel: { color: '#8b949e', fontSize: 11, marginTop: 3 },
  listPad: { paddingBottom: 30, gap: 10 },
  listCard: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  listMain: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  listEmoji: { fontSize: 26, marginRight: 10 },
  listTextWrap: { flex: 1 },
  listTitle: { color: '#e6edf3', fontWeight: '700', marginBottom: 2 },
  listMeta: { color: '#8b949e', fontSize: 12 },
  smallBtn: {
    backgroundColor: '#21262d',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  smallBtnText: { color: '#e6edf3', fontSize: 12, fontWeight: '600' },
  emptyText: { color: '#8b949e', textAlign: 'center', marginTop: 20 },
  postCard: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  postTag: { color: '#f0b429', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2 },
  postTitle: { color: '#e6edf3', fontWeight: '800', fontSize: 16 },
  postBody: { color: '#c9d1d9', lineHeight: 20 },
  postMeta: { color: '#8b949e', fontSize: 12 },
  spaceTop: { marginTop: 20 },
  profilePoints: { color: '#f0b429', fontSize: 36, fontWeight: '800' },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  rewardTitle: { color: '#e6edf3', fontWeight: '700' },
  rewardMeta: { color: '#8b949e', fontSize: 12, marginTop: 2 },
  rewardState: { color: '#f0b429', fontSize: 12, fontWeight: '700' },
});
