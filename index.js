import React, { useEffect, useMemo, useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  Switch,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

const API_BASE = 'https://b7mshalko4.execute-api.us-east-1.amazonaws.com/dev';
const TOKEN_KEY = 'safecheck_token';
const PROFILE_KEY = 'safecheck_profile';
const SETTINGS_KEY = 'safecheck_settings';
const TABS = ['Scan', 'Inventory', 'Community', 'Profile'];

// 👉 THE MASTER COLOR PALETTES
const lightColors = {
  background: '#F7F3EE',
  authBg: '#d8e2d5',
  card: '#FFFDF9',
  primaryGreen: '#35543A',
  softGreen: '#DDE8D9',
  buttonGreen: '#E4EAD9',
  mutedText: '#8B8E84',
  bodyText: '#2F3A33',
  border: '#E3DBD1',
  goldAccent: '#f0b429',
};

const darkColors = {
  background: '#0F1411', // Deep earthy forest-black
  authBg: '#1A221C',     
  card: '#1A221C',       // Deep earthy gray-green
  primaryGreen: '#C4D6C6',// Light frosty sage
  softGreen: '#2A3B2D',  // Deep sage (Active tabs)
  buttonGreen: '#334736',// Dark sage buttons
  mutedText: '#98A39A',  // Lighter gray-green text
  bodyText: '#E6EBE6',   // Off-white text
  border: '#2E3D31',     // Dark sage borders
  goldAccent: '#f0b429', // Retain brand gold
};

export default function App() {
  const [tab, setTab] = useState('Scan');
  const [token, setToken] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [authMode, setAuthMode] = useState('welcome');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [profile, setProfile] = useState({ name: '', email: '' });
  
  // 👉 SETTINGS STATE
  const [settings, setSettings] = useState({
    notifications: true,
    isDarkMode: false,
    privacy: 'Standard',
    language: 'English',
  });

  const [scanInput, setScanInput] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const [inventory, setInventory] = useState([]);
  const [inventorySummary, setInventorySummary] = useState({ total: 0, recalled: 0, warning: 0, safe: 0 });
  const [community, setCommunity] = useState([]);
  const [officialFeed, setOfficialFeed] = useState([]);
  const [points, setPoints] = useState({ totalPoints: 0, tier: 'Scout', pointsToNextTier: null, nextTier: null, rewards: [] });

  const [loadingTab, setLoadingTab] = useState(false);

  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantMessages, setAssistantMessages] = useState([
    { role: 'assistant', text: 'Hi — I’m your SafeCheck AI assistant. Ask me about product recalls, safety tips, or how to use the app.' },
  ]);

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);
  const [isEditNameOpen, setIsEditNameOpen] = useState(false);
  const [tempName, setTempName] = useState('');

  const loggedIn = !!token;
  
  // 👉 THEME APPLICATION
  const isDark = settings.isDarkMode;
  const theme = isDark ? darkColors : lightColors;
  // useMemo ensures the stylesheet only regenerates when the theme flips
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);

  useEffect(() => {
    (async () => {
      const savedToken = await AsyncStorage.getItem(TOKEN_KEY);
      const savedProfile = await AsyncStorage.getItem(PROFILE_KEY);
      const savedSettings = await AsyncStorage.getItem(SETTINGS_KEY);

      if (savedToken) setToken(savedToken);
      if (savedProfile) {
        try { setProfile(JSON.parse(savedProfile)); } 
        catch { setProfile({ name: '', email: '' }); }
      }
      if (savedSettings) {
        try { setSettings(JSON.parse(savedSettings)); } 
        catch (e) { console.log("Failed to parse settings"); }
      }
    })();
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    if (tab === 'Inventory') loadInventory();
    if (tab === 'Community') {
      loadCommunity();
      loadOfficialFeed();
    }
    if (tab === 'Profile') loadPoints();
  }, [tab, loggedIn]);

  async function updateSetting(key, value) {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
  }

  function toTitleCase(str = '') {
    return str.replace(/[._-]+/g, ' ').split(' ').filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  }

  function getDisplayName() {
    const rawName = profile.name?.trim() || fullName?.trim() || '';
    if (rawName) return rawName; 
    const rawEmail = profile.email?.trim() || email?.trim() || '';
    if (rawEmail) return toTitleCase(rawEmail.split('@')[0]);
    return 'User';
  }

  async function saveProfile(nextProfile) {
    setProfile(nextProfile);
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
  }

  async function handleSaveName() {
    await saveProfile({ ...profile, name: tempName.trim() });
    setIsEditNameOpen(false);
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = token;
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
    return data;
  }

  async function registerUser() {
    if (!email || !password) return Alert.alert('Missing info', 'Enter email and password.');
    if (password !== confirmPassword) return Alert.alert('Password mismatch', 'Passwords do not match.');
    try {
      setAuthBusy(true);
      await api('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      await saveProfile({ name: fullName.trim(), email: email.trim() });
      Alert.alert('Registered', 'Account created. Now log in.');
      setPassword(''); setConfirmPassword(''); setAuthMode('login');
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
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const rawText = await res.text();
      let data = {};
      try { data = rawText ? JSON.parse(rawText) : {}; } catch (e) { throw new Error(`Backend did not return valid JSON: ${rawText}`); }
      if (!res.ok) throw new Error(data.error || `Login failed (${res.status})`);
      
      const bodyData = typeof data.body === 'string' ? (() => { try { return JSON.parse(data.body); } catch { return {}; } })() : data.body || {};
      const authResult = data.AuthenticationResult || bodyData.AuthenticationResult || {};
      const returnedToken = data.token || data.accessToken || data.idToken || data.jwt || bodyData.token || bodyData.accessToken || bodyData.idToken || bodyData.jwt || authResult.AccessToken || authResult.IdToken || authResult.RefreshToken;

      if (!returnedToken) throw new Error(`No token returned from backend.`);
      await AsyncStorage.setItem(TOKEN_KEY, returnedToken);
      const nextProfile = { name: fullName?.trim() || profile.name || '', email: email.trim() };
      await saveProfile(nextProfile);
      setToken(returnedToken);
      setFullName(''); setEmail(''); setPassword(''); setConfirmPassword('');
      setAuthMode('welcome'); setTab('Scan');
    } catch (err) {
      Alert.alert('Login failed', err.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function logoutUser() {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(PROFILE_KEY);
    setToken(null); setScanResult(null); setInventory([]); setCommunity([]); setOfficialFeed([]);
    setPoints({ totalPoints: 0, tier: 'Scout', pointsToNextTier: null, nextTier: null, rewards: [] });
    setProfile({ name: '', email: '' });
    setAssistantOpen(false); setAssistantInput('');
    setAssistantMessages([{ role: 'assistant', text: 'Hi — I’m your SafeCheck AI assistant. Ask me about product recalls, safety tips, or how to use the app.' }]);
    setFullName(''); setEmail(''); setPassword(''); setConfirmPassword(''); setAuthMode('welcome');
  }

  async function openCamera() {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) return Alert.alert("Permission needed", "We need camera access to scan barcodes.");
    }
    setIsCameraOpen(true);
  }

  async function handleBarCodeScanned({ type, data }) {
    if (isScanning) return; 
    setIsScanning(true); setIsCameraOpen(false);
    try {
      const resultData = await api('/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: data }),
      });
      setScanResult(resultData);
    } catch (err) {
      Alert.alert('Scan Error', err.message);
    } finally {
      setIsScanning(false);
    }
  }

  async function submitScan() {
    if (!scanInput.trim()) return; 
    setIsScanning(true); Keyboard.dismiss(); 
    try {
      const resultData = await api('/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: scanInput.trim() }), 
      });
      setScanResult(resultData);
    } catch (err) {
      Alert.alert('Search Error', err.message);
    } finally {
      setIsScanning(false); setScanInput(''); 
    }
  }

  async function addScanToInventory(item) {
    if (!item) return;
    try {
      await api('/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: item.productName || scanResult?.productName || 'Unknown Product',
          barcode: item.barcode || scanResult?.barcode || null,
          status: item.status,
          cpscData: item,
          imageUrl: item.imageUrl, 
          emoji: item.status === 'recalled' ? '⚠️' : item.status === 'safe' ? '✅' : '📦',
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

  async function runSafetyAudit() {
    try {
      setSyncing(true);
      const res = await api('/inventory', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' })
      });
      if (res.updatedItems && res.updatedItems.length > 0) {
        const itemNames = res.updatedItems.map(i => i.productName).join('\n• ');
        Alert.alert("⚠️ SAFETY ALERT!", `The CPSC has just issued a recall for ${res.updatedItems.length} item(s) in your inventory:\n\n• ${itemNames}\n\nPlease check your inventory for remedy instructions.`);
        loadInventory(); 
      } else {
        Alert.alert("Audit Complete", "Great news! None of your tracked items have new recall notices.");
      }
    } catch (err) {
      Alert.alert("Audit Failed", err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function deleteInventoryItem(itemId) {
    try {
      await api('/inventory', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId }) });
      loadInventory();
    } catch (err) { Alert.alert('Delete failed', err.message); }
  }

  async function loadCommunity() {
    try {
      setLoadingTab(true);
      const data = await api('/community');
      setCommunity(data.posts || []);
    } catch (err) { Alert.alert('Community error', err.message); } finally { setLoadingTab(false); }
  }

  async function loadOfficialFeed() {
    try {
      const cachedFeed = await AsyncStorage.getItem('@safecheck_news_cache');
      if (cachedFeed) setOfficialFeed(JSON.parse(cachedFeed)); 
    } catch (e) {}
    try {
      const data = await api('/community/feed');
      setOfficialFeed(data.items || []);
      await AsyncStorage.setItem('@safecheck_news_cache', JSON.stringify(data.items || []));
    } catch (err) {}
  }

  async function createCommunityPost() {
    Alert.prompt?.('New Report', 'Title', async (title) => {
      if (!title) return;
      Alert.prompt?.('New Report', 'Describe the issue', async (body) => {
        if (!body) return;
        try {
          await api('/community', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, body, hazardTag: 'other' }) });
          loadCommunity(); loadPoints();
        } catch (err) { Alert.alert('Post failed', err.message); }
      });
    });
  }

  async function loadPoints() {
    try {
      setLoadingTab(true);
      const data = await api('/community/points').catch(async () => await api('/points'));
      setPoints(data);
    } catch (err) {} finally { setLoadingTab(false); }
  }

  async function sendAssistantMessage() {
    const message = assistantInput.trim();
    if (!message || assistantBusy) return;
    setAssistantMessages((prev) => [...prev, { role: 'user', text: message }]);
    setAssistantInput('');
    try {
      setAssistantBusy(true);
      const data = await api('/assistant/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
      let responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data;
      setAssistantMessages((prev) => [...prev, { role: 'assistant', text: responseBody.reply || data.reply || 'I could not generate a response right now.' }]);
    } catch (err) {
      setAssistantMessages((prev) => [...prev, { role: 'assistant', text: 'Sorry, I ran into a problem connecting to the assistant.' }]);
    } finally { setAssistantBusy(false); }
  }

  async function openUrl(url) {
    if (!url) return;
    if (await Linking.canOpenURL(url)) await Linking.openURL(url);
  }

  function renderWelcomeAuth() {
    return (
      <View style={styles.authScreen}>
        <View style={styles.authTopFull}>
          <View style={styles.authTopOverlay}>
            <Text style={styles.welcomeHeroTitle}>Welcome</Text>
            <Text style={styles.welcomeHeroSubtitle}>Check products. Stay safe. Protect your home.</Text>
          </View>
        </View>
        <View style={styles.authBottomSheet}>
          <TouchableOpacity style={styles.authMainBtn} onPress={() => setAuthMode('login')}><Text style={styles.authMainBtnText}>SIGN IN</Text></TouchableOpacity>
          <TouchableOpacity style={styles.authAltBtn} onPress={() => setAuthMode('signup')}><Text style={styles.authAltBtnText}>SIGN UP</Text></TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderLoginAuth() {
    return (
      <KeyboardAvoidingView style={styles.authKeyboardWrap} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView contentContainerStyle={styles.authScrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.authScreen}>
              <View style={styles.authTopFull}>
                <View style={styles.authTopBarRow}><TouchableOpacity onPress={() => setAuthMode('welcome')}><Text style={styles.authBackText}>← Back</Text></TouchableOpacity></View>
                <View style={styles.authTopContent}><Text style={styles.authBigTitle}>Hello{'\n'}Sign in!</Text></View>
              </View>
              <View style={styles.authBottomSheet}>
                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput value={email} onChangeText={setEmail} placeholder="Enter your email" placeholderTextColor={theme.mutedText} style={styles.sheetInput} autoCapitalize="none" keyboardType="email-address" returnKeyType="next" />
                <Text style={styles.fieldLabel}>Password</Text>
                <TextInput value={password} onChangeText={setPassword} placeholder="Enter your password" placeholderTextColor={theme.mutedText} style={styles.sheetInput} secureTextEntry returnKeyType="done" />
                <TouchableOpacity style={styles.forgotWrap}><Text style={styles.forgotText}>Forgot password?</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.authMainBtn, authBusy && styles.disabledBtn]} onPress={loginUser} disabled={authBusy}><Text style={styles.authMainBtnText}>{authBusy ? 'WORKING...' : 'SIGN IN'}</Text></TouchableOpacity>
                <View style={styles.bottomSwitchRow}>
                  <Text style={styles.bottomSwitchText}>Don’t have an account?</Text>
                  <TouchableOpacity onPress={() => setAuthMode('signup')}><Text style={styles.bottomSwitchLink}> Sign up</Text></TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    );
  }

  function renderSignupAuth() {
    return (
      <KeyboardAvoidingView style={styles.authKeyboardWrap} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView contentContainerStyle={styles.authScrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.authScreen}>
              <View style={styles.authTopFull}>
                <View style={styles.authTopBarRow}><TouchableOpacity onPress={() => setAuthMode('welcome')}><Text style={styles.authBackText}>← Back</Text></TouchableOpacity></View>
                <View style={styles.authTopContent}><Text style={styles.authBigTitle}>Create Your Account</Text></View>
              </View>
              <View style={styles.authBottomSheet}>
                <Text style={styles.fieldLabel}>Full Name</Text>
                <TextInput value={fullName} onChangeText={setFullName} placeholder="Enter your name" placeholderTextColor={theme.mutedText} style={styles.sheetInput} returnKeyType="next" />
                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput value={email} onChangeText={setEmail} placeholder="Enter your email" placeholderTextColor={theme.mutedText} style={styles.sheetInput} autoCapitalize="none" keyboardType="email-address" returnKeyType="next" />
                <Text style={styles.fieldLabel}>Password</Text>
                <TextInput value={password} onChangeText={setPassword} placeholder="Create a password" placeholderTextColor={theme.mutedText} style={styles.sheetInput} secureTextEntry returnKeyType="next" />
                <Text style={styles.fieldLabel}>Confirm Password</Text>
                <TextInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm password" placeholderTextColor={theme.mutedText} style={styles.sheetInput} secureTextEntry returnKeyType="done" />
                <TouchableOpacity style={[styles.authMainBtn, authBusy && styles.disabledBtn]} onPress={registerUser} disabled={authBusy}><Text style={styles.authMainBtnText}>{authBusy ? 'WORKING...' : 'SIGN UP'}</Text></TouchableOpacity>
                <View style={styles.bottomSwitchRow}>
                  <Text style={styles.bottomSwitchText}>Already have an account?</Text>
                  <TouchableOpacity onPress={() => setAuthMode('login')}><Text style={styles.bottomSwitchLink}> Sign in</Text></TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    );
  }

  function renderTabContent() {
    if (!loggedIn) {
      if (authMode === 'welcome') return renderWelcomeAuth();
      if (authMode === 'login') return renderLoginAuth();
      return renderSignupAuth();
    }

    if (tab === 'Scan') {
      return (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Scan Product</Text>
            <Text style={styles.cardIntro}>Search by barcode or product name to check for recall notices.</Text>
            <View style={styles.scanInputWrap}>
              <Text style={styles.scanInputIcon}>⌕</Text>
              <TextInput value={scanInput} onChangeText={setScanInput} placeholder="Enter barcode or product name" placeholderTextColor={theme.mutedText} style={styles.scanInput} />
            </View>
            <TouchableOpacity style={styles.primaryBtnLarge} onPress={submitScan} disabled={scanBusy}>
              <Text style={styles.primaryBtnText}>{scanBusy ? 'Checking...' : 'Check Product'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primaryBtnLarge, { backgroundColor: isDark ? '#C4D6C6' : '#21262d', marginTop: 10 }]} onPress={openCamera}>
              <Text style={[styles.primaryBtnText, { color: isDark ? '#1A221C' : '#e6edf3' }]}>Scan</Text>
            </TouchableOpacity>
          </View>

          {scanResult?.results && scanResult.results.length > 0 ? (
            scanResult.results.map((item, index) => (
              <View key={index} style={styles.resultCard}>
                <View style={styles.resultTopRow}>
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={{ width: 90, height: 90, borderRadius: 8, marginRight: 12 }} resizeMode="cover" />
                  ) : (
                    <Text style={styles.bigEmoji}>{item.status === 'recalled' ? '⚠️' : item.status === 'safe' ? '✅' : '📦'}</Text>
                  )}
                  <View style={styles.resultTitleWrap}>
                    <Text style={[styles.itemTitle, item.status === 'safe' && { fontSize: 16 }]}>
                      {item.productName || scanResult.productName || 'Unknown Product'}
                    </Text>
                    <Text style={styles.badge(item.status)}>{String(item.status || 'unknown').toUpperCase()}</Text>
                  </View>
                </View>

                {!!item.hazard && <Text style={styles.detail}><Text style={styles.detailLabel}>Hazard: </Text>{item.hazard}</Text>}
                {!!item.remedy && <Text style={styles.detail}><Text style={styles.detailLabel}>Remedy: </Text>{item.remedy}</Text>}
                {!!item.recallDate && <Text style={styles.detail}><Text style={styles.detailLabel}>Recall Date: </Text>{item.recallDate}</Text>}
                
                {item.status === 'safe' && (
                  <Text style={[styles.detail, { color: isDark ? '#7ee787' : '#4E8656', fontStyle: 'italic', marginTop: 4 }]}>
                    This product is not currently listed in the CPSC recall database and appears safe for use.
                  </Text>
                )}

                {!!item.cpscUrl && (
                  <TouchableOpacity onPress={() => openUrl(item.cpscUrl)} style={{ marginTop: 8, marginBottom: 4 }}>
                    <Text style={{ color: theme.goldAccent, fontWeight: '800', fontSize: 14 }}>Read Full Notice ↗</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.primaryBtn} onPress={() => addScanToInventory(item)}>
                  <Text style={styles.primaryBtnText}>Add to Inventory</Text>
                </TouchableOpacity>
              </View>
            ))
          ) : scanResult && !scanResult.results ? (
            <View style={styles.resultCard}>
              <View style={styles.resultTopRow}>
                <Text style={styles.bigEmoji}>{scanResult.status === 'recalled' ? '⚠️' : scanResult.status === 'safe' ? '✅' : '📦'}</Text>
                <View style={styles.resultTitleWrap}>
                  <Text style={styles.itemTitle}>{scanResult.productName || 'Unknown Product'}</Text>
                  <Text style={styles.badge(scanResult.status)}>{String(scanResult.status || 'unknown').toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.muted}>{scanResult.message || 'Scan complete'}</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={addScanToInventory}><Text style={styles.primaryBtnText}>Add to Inventory</Text></TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyStateCard}>
              <Text style={styles.emptyStateEmoji}>🔎</Text>
              <Text style={styles.emptyStateTitle}>Ready to scan</Text>
              <Text style={styles.emptyStateText}>Search a product to see recall notices, remedies, and safety warnings.</Text>
            </View>
          )}

          <Modal visible={isCameraOpen} animationType="slide" transparent={false}>
            <SafeAreaProvider>
              <SafeAreaView style={{ flex: 1, backgroundColor: 'black' }}>
                <CameraView style={{ flex: 1 }} onBarcodeScanned={handleBarCodeScanned} barcodeScannerSettings={{ barcodeTypes: ["upc_a", "upc_e", "ean13", "ean8", "qr"] }} />
                <TouchableOpacity style={{ position: 'absolute', top: 50, right: 20, padding: 15, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10 }} onPress={() => setIsCameraOpen(false)}>
                  <Text style={{ color: 'white', fontWeight: 'bold' }}>Close Camera</Text>
                </TouchableOpacity>
              </SafeAreaView>
            </SafeAreaProvider>
          </Modal>
        </ScrollView>
      );
    }

    if (tab === 'Inventory') {
      return (
        <View style={styles.flex1}>
          <View style={styles.summaryRow}>
            <Metric label="Tracked" value={inventorySummary.total} styles={styles} />
            <Metric label="Recalled" value={inventorySummary.recalled} styles={styles} />
            <Metric label="Warning" value={inventorySummary.warning} styles={styles} />
            <Metric label="Safe" value={inventorySummary.safe} styles={styles} />
          </View>
          
          <TouchableOpacity style={[styles.primaryBtnLarge, { marginBottom: 12 }]} onPress={runSafetyAudit} disabled={syncing}>
            <Text style={styles.primaryBtnText}>{syncing ? 'Running Safety Audit...' : '🔄 Run Safety Audit'}</Text>
          </TouchableOpacity>

          {loadingTab ? <ActivityIndicator color={theme.goldAccent} /> : (
            <FlatList
              data={inventory}
              keyExtractor={(item) => item.itemId}
              contentContainerStyle={styles.listPad}
              renderItem={({ item }) => (
                <View style={styles.listCard}>
                  <TouchableOpacity style={styles.listMain} activeOpacity={item.cpscData?.cpscUrl ? 0.6 : 1} onPress={() => { if (item.cpscData && item.cpscData.cpscUrl) openUrl(item.cpscData.cpscUrl); }}>
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={{ width: 42, height: 42, borderRadius: 8, marginRight: 14 }} resizeMode="cover" />
                    ) : (
                      <Text style={styles.listEmoji}>{item.emoji || '📦'}</Text>
                    )}
                    <View style={styles.listTextWrap}>
                      <Text style={styles.listTitle}>{item.productName}</Text>
                      <Text style={styles.listMeta}>{item.barcode || item.itemId}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => deleteInventoryItem(item.itemId)}>
                    <Text style={styles.smallBtnText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptyStateCard}>
                  <Text style={styles.emptyStateEmoji}>📦</Text>
                  <Text style={styles.emptyStateTitle}>No items yet</Text>
                  <Text style={styles.emptyStateText}>Start scanning products to build your safety inventory.</Text>
                </View>
              }
            />
          )}
        </View>
      );
    }

    if (tab === 'Community') {
      const featuredItem = officialFeed[0];
      const latestItems = officialFeed.slice(1, 7);

      return (
        <FlatList
          data={community}
          keyExtractor={(item) => item.postId}
          contentContainerStyle={styles.communityPageContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View>
              <Text style={styles.communityHeroTitle}>Safety News</Text>
              <Text style={styles.communityHeroSubtitle}>Official recalls, alerts, and updates from the Consumer Product Safety Commission.</Text>

              {featuredItem ? (
                <TouchableOpacity activeOpacity={0.9} style={styles.featuredNewsCard} onPress={() => openUrl(featuredItem.url)}>
                  <Text style={styles.newsBadge}>Featured Update</Text>
                  {featuredItem.imageUrl && (
                    <Image source={{ uri: featuredItem.imageUrl }} style={{ width: '100%', height: 160, borderRadius: 12, marginBottom: 12 }} resizeMode="cover" />
                  )}
                  <Text style={styles.featuredNewsTitle}>{featuredItem.title}</Text>
                  <Text style={styles.featuredNewsSummary} numberOfLines={4}>{featuredItem.summary || 'Official CPSC update.'}</Text>
                  <View style={styles.featuredNewsFooter}>
                    <Text style={styles.featuredNewsSource}>{featuredItem.source || 'CPSC'}</Text>
                    {!!featuredItem.date && <Text style={styles.featuredNewsDate}>{featuredItem.date}</Text>}
                  </View>
                </TouchableOpacity>
              ) : (
                <View style={styles.newsEmptyCard}>
                  <Text style={styles.newsEmptyEmoji}>📰</Text>
                  <Text style={styles.newsEmptyTitle}>No featured update yet</Text>
                  <Text style={styles.newsEmptyText}>Official CPSC stories will appear here when the feed loads.</Text>
                </View>
              )}

              <View style={styles.newsSectionRow}><Text style={styles.newsSectionTitle}>Latest Updates</Text></View>
              {latestItems.length > 0 ? latestItems.map((item, index) => (
                <TouchableOpacity key={String(item.id || index)} activeOpacity={0.85} style={styles.newsListCard} onPress={() => openUrl(item.url)}>
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={{ width: 66, height: 66, borderRadius: 10, marginRight: 14 }} resizeMode="cover" />
                  ) : (
                    <View style={styles.newsListLeft}><View style={styles.newsDot} /></View>
                  )}
                  <View style={styles.newsListBody}>
                    <Text style={styles.newsListTitle} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.newsListSummary} numberOfLines={2}>{item.summary || 'Official CPSC safety notice.'}</Text>
                    <View style={styles.newsMetaRow}>
                      <Text style={styles.newsMetaSource}>{item.source || 'CPSC'}</Text>
                      {!!item.date && <Text style={styles.newsListDate}>{item.date}</Text>}
                    </View>
                  </View>
                </TouchableOpacity>
              )) : (
                <View style={styles.newsEmptySmall}><Text style={styles.newsEmptySmallText}>No recent updates available right now.</Text></View>
              )}

              <View style={styles.communityReportsHeader}>
                <View>
                  <Text style={styles.communityReportsTitle}>Community Reports</Text>
                  <Text style={styles.communityReportsSubtitle}>Reports shared by SafeCheck users</Text>
                </View>
                <TouchableOpacity style={styles.primaryMiniBtn} onPress={createCommunityPost}><Text style={styles.primaryMiniBtnText}>New Report</Text></TouchableOpacity>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.postCard}>
              <Text style={styles.postTag}>{item.hazardTag || 'other'}</Text>
              <Text style={styles.postTitle}>{item.title}</Text>
              <Text style={styles.postBody}>{item.body}</Text>
              <Text style={styles.postMeta}>{item.authorName || 'Anonymous'} · {item.votes || 0} votes</Text>
            </View>
          )}
          ListEmptyComponent={!loadingTab ? (
            <View style={styles.emptyStateCard}>
              <Text style={styles.emptyStateEmoji}>👥</Text>
              <Text style={styles.emptyStateTitle}>No community reports yet</Text>
              <Text style={styles.emptyStateText}>Be the first to share a safety concern with the community.</Text>
            </View>
          ) : null}
        />
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.profileHero}>
          <View style={styles.profileAvatarCircle}><Text style={styles.profileAvatarIcon}>👤</Text></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={styles.profileName}>{getDisplayName()}</Text>
            <TouchableOpacity onPress={() => { setTempName(getDisplayName() === 'User' ? '' : getDisplayName()); setIsEditNameOpen(true); }} style={{ marginLeft: 8, padding: 4 }}>
              <Text style={{ fontSize: 16 }}></Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.profileEmail}>{profile.email || email || 'No email available'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Points Overview</Text>
          <Text style={styles.profilePoints}>{points.totalPoints || 0} pts</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: points.nextTier && points.pointsToNextTier != null ? `${Math.max(8, Math.min(100, ((points.totalPoints || 0) / ((points.totalPoints || 0) + (points.pointsToNextTier || 0))) * 100))}%` : '100%' }]} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Settings</Text>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Notifications</Text>
            <Switch value={settings.notifications} onValueChange={(val) => updateSetting('notifications', val)} trackColor={{ false: theme.authBg, true: theme.goldAccent }} thumbColor={Platform.OS === 'ios' ? '#ffffff' : settings.notifications ? '#ffffff' : '#f4f3f4'} />
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Dark Mode</Text>
            <Switch value={settings.isDarkMode} onValueChange={(val) => updateSetting('isDarkMode', val)} trackColor={{ false: theme.authBg, true: theme.goldAccent }} thumbColor={Platform.OS === 'ios' ? '#ffffff' : settings.isDarkMode ? '#ffffff' : '#f4f3f4'} />
          </View>
          <TouchableOpacity style={styles.settingRow} onPress={() => updateSetting('privacy', settings.privacy === 'Standard' ? 'Strict' : 'Standard')}>
            <Text style={styles.settingLabel}>Privacy</Text>
            <Text style={styles.settingValue}>{settings.privacy} ▾</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingRow} onPress={() => updateSetting('language', settings.language === 'English' ? 'Español' : 'English')}>
            <Text style={styles.settingLabel}>Language</Text>
            <Text style={styles.settingValue}>{settings.language} ▾</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingRow} onPress={() => Alert.alert("Support", "Contact us at support@safecheck.app")}>
            <Text style={styles.settingLabel}>Help & Support</Text>
            <Text style={styles.settingValue}>Open ↗</Text>
          </TouchableOpacity>
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

        <TouchableOpacity style={styles.secondaryBtnFull} onPress={logoutUser}>
          <Text style={styles.secondaryBtnText}>Logout</Text>
        </TouchableOpacity>

        <Modal visible={isEditNameOpen} transparent animationType="fade">
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={{ backgroundColor: theme.card, padding: 22, borderRadius: 18, borderWidth: 1, borderColor: theme.border }}>
              <Text style={styles.sectionTitle}>EDIT NAME</Text>
              <TextInput value={tempName} onChangeText={setTempName} style={[styles.input, { marginTop: 12, marginBottom: 24, fontSize: 16 }]} placeholder="Enter your full name" placeholderTextColor={theme.mutedText} autoFocus />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => setIsEditNameOpen(false)}><Text style={styles.secondaryBtnText}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.primaryBtn, { flex: 1, marginTop: 0 }]} onPress={handleSaveName}><Text style={styles.primaryBtnText}>Save Name</Text></TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </ScrollView>
    );
  } 

  return (
    <View style={[styles.root, !loggedIn && { backgroundColor: theme.authBg }]}>
      <StatusBar style={isDark ? "light" : "dark"} translucent backgroundColor="transparent" />
      {loggedIn ? (
        <SafeAreaProvider>
          <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <View style={styles.headerCenterWrap}>
              <Text style={styles.logoCentered}>SafeCheck</Text>
              <TouchableOpacity style={styles.aiEagleBtn} onPress={() => setAssistantOpen(true)} activeOpacity={0.85}>
                <Image source={require('./assets/images/eagle-outline.png')} style={styles.aiEagleImage} resizeMode="contain" />
              </TouchableOpacity>
            </View>
            <View style={styles.content}>{renderTabContent()}</View>

            {/* 👉 2. NEW BOTTOM TAB BAR ADDED HERE */}
            <View style={styles.bottomNav}>
              {TABS.map((t) => {
                // Pick the right icon for each tab
                let iconName = 'scan-outline';
                if (t === 'Inventory') iconName = 'cube-outline';
                if (t === 'Community') iconName = 'people-outline';
                if (t === 'Profile') iconName = 'person-outline';

                const isActive = tab === t;
                const activeColor = isDark ? theme.bodyText : theme.primaryGreen;

                return (
                  <TouchableOpacity key={t} style={styles.bottomNavBtn} onPress={() => setTab(t)}>
                    <Ionicons
                      name={isActive ? iconName.replace('-outline', '') : iconName}
                      size={24}
                      color={isActive ? activeColor : theme.mutedText}
                    />
                    <Text style={[styles.bottomNavText, isActive && { color: activeColor, fontWeight: '700' }]}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* AI Assistant Modal */}
            <Modal visible={assistantOpen} animationType="slide" transparent onRequestClose={() => setAssistantOpen(false)}>
              <KeyboardAvoidingView style={styles.assistantOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}>
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { Keyboard.dismiss(); setAssistantOpen(false); }} />
                <View style={[styles.assistantSheet, { flex: 0, height: '85%' }]}>
                  <View style={styles.assistantHeader}>
                    <View>
                      <Text style={styles.assistantTitle}>Eagle AI Assistant</Text>
                      <Text style={styles.assistantSubtitle}>Powered by Amazon Bedrock</Text>
                    </View>
                    <TouchableOpacity onPress={() => setAssistantOpen(false)}><Text style={styles.assistantClose}>✕</Text></TouchableOpacity>
                  </View>
                  <ScrollView style={styles.assistantMessages} contentContainerStyle={styles.assistantMessagesContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
                    {assistantMessages.map((msg, index) => (
                      <View key={`${msg.role}-${index}`} style={[styles.chatBubble, msg.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
                        <Text style={[styles.chatBubbleText, msg.role === 'user' ? styles.userBubbleText : styles.assistantBubbleText]}>{msg.text}</Text>
                      </View>
                    ))}
                  </ScrollView>
                  <View style={styles.assistantInputRow}>
                    <TextInput value={assistantInput} onChangeText={setAssistantInput} placeholder="Ask the assistant..." placeholderTextColor={theme.mutedText} style={styles.assistantInput} multiline />
                    <TouchableOpacity style={[styles.assistantSendBtn, assistantBusy && styles.disabledBtn]} onPress={sendAssistantMessage} disabled={assistantBusy}>
                      <Text style={styles.assistantSendText}>{assistantBusy ? '...' : 'Send'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </KeyboardAvoidingView>
            </Modal>
          </SafeAreaView>
        </SafeAreaProvider>
      ) : (
        <View style={styles.authRootContent}>{renderTabContent()}</View>
      )}
    </View>
  );
}

function Metric({ label, value, styles }) {
  return (
    <View style={styles.metricBox}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

// 👉 THE DYNAMIC STYLESHEET FUNCTION
const getStyles = (theme, isDark) => StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.background },
  authRootContent: { 
    flex: 1 
  },

  authKeyboardWrap: { 
    flex: 1 
  },

  authScrollContent: { 
    flexGrow: 1 
  },

  authScreen: { 
    flex: 1, 
    backgroundColor: theme.authBg 
  },

  authTopFull: { 
    flex: 1, 
    backgroundColor: theme.authBg, 
    paddingTop: 70, 
    paddingHorizontal: 24 
  },

  authTopOverlay: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },

  authTopBarRow: { 
    paddingTop: 10, 
    marginBottom: 16 
  },

  authBackText: { 
    color: theme.primaryGreen, 
    fontSize: 16, 
    fontWeight: '600' 
  },

  authTopContent: { 
    flex: 1, 
    justifyContent: 'center' 
  },
  
  welcomeHeroTitle: { 
    color: theme.primaryGreen, 
    fontSize: 42, fontWeight: '800', 
    textAlign: 'center', 
    marginBottom: 12 
  },

  welcomeHeroSubtitle: { 
    color: theme.mutedText, 
    fontSize: 17, 
    textAlign: 'center', 
    lineHeight: 24, 
    paddingHorizontal: 12 
  },

  authBigTitle: { 
    color: theme.primaryGreen, 
    textAlign: 'center', 
    fontSize: 45, 
    fontWeight: '800', 
    lineHeight: 43 
  },

  authBottomSheet: { 
    backgroundColor: theme.card, 
    borderTopLeftRadius: 40, 
    borderTopRightRadius: 40, 
    paddingHorizontal: 24, 
    paddingTop: 28, 
    paddingBottom: 36, 
    minHeight: '35%' 
  },
  bottomNav: { 
    flexDirection: 'row', 
    backgroundColor: theme.card, 
    borderTopWidth: 1, 
    borderTopColor: theme.border, 
    paddingTop: 12, 
    paddingBottom: Platform.OS === 'ios' ? 10 : 16, // Adjusts for iPhone swipe bar
    justifyContent: 'space-around' 
  },
  bottomNavBtn: { 
    alignItems: 'center', 
    justifyContent: 'center', 
    flex: 1 
  },
  bottomNavText: { 
    fontSize: 10, 
    marginTop: 4, 
    color: theme.mutedText 
  },
  fieldLabel: { color: theme.primaryGreen, fontSize: 15, fontWeight: '700', marginBottom: 6, marginTop: 10 },
  sheetInput: { borderBottomWidth: 1, borderBottomColor: theme.border, paddingVertical: 12, fontSize: 16, color: theme.bodyText, marginBottom: 10 },
  forgotWrap: { alignItems: 'flex-end', marginTop: 6, marginBottom: 26 },
  forgotText: { color: theme.mutedText, fontSize: 15 },
  authMainBtn: { height: 56, borderRadius: 28, backgroundColor: theme.buttonGreen, justifyContent: 'center', alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: theme.border },
  authMainBtnText: { color: theme.primaryGreen, fontSize: 20, fontWeight: '800' },
  authAltBtn: { height: 56, borderRadius: 28, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.primaryGreen, justifyContent: 'center', alignItems: 'center', marginTop: 15 },
  authAltBtnText: { color: theme.primaryGreen, fontSize: 20, fontWeight: '800' },
  authSmallText: { textAlign: 'center', color: theme.mutedText, fontSize: 14, marginTop: 24 },
  bottomSwitchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 28, flexWrap: 'wrap' },
  bottomSwitchText: { color: theme.mutedText, fontSize: 15 },
  bottomSwitchLink: { color: theme.primaryGreen, fontSize: 15, fontWeight: '800' },
  disabledBtn: { opacity: 0.6 },
  container: { flex: 1, backgroundColor: theme.background, paddingTop: 10 },
  flex1: { flex: 1 },
  scrollContent: { paddingBottom: 28, gap: 14 },
  headerCenterWrap: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  logoCentered: { color: theme.primaryGreen, fontSize: 35, fontWeight: '700', letterSpacing: 0.5, textAlign: 'center' },
  aiEagleBtn: { position: 'absolute', right: 20, top: 10, width: 52, height: 52, borderRadius: 26, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  aiEagleImage: { width: 28, height: 28, tintColor: theme.goldAccent },
  nav: { flexDirection: 'row', backgroundColor: theme.card, marginHorizontal: 16, borderRadius: 18, padding: 5, gap: 4, borderWidth: 1, borderColor: theme.border },
  navBtn: { flex: 1, paddingVertical: 11, borderRadius: 14, alignItems: 'center' },
  navBtnActive: { backgroundColor: theme.softGreen },
  navText: { color: theme.mutedText, fontSize: 12, fontWeight: '700' },
  navTextActive: { color: isDark ? theme.bodyText : theme.primaryGreen },
  content: { flex: 1, padding: 16 },
  card: { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 22, padding: 16, marginBottom: 12, gap: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  resultCard: { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.goldAccent, borderRadius: 22, padding: 16, gap: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  sectionTitle: { color: theme.mutedText, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.4 },
  cardIntro: { color: theme.mutedText, lineHeight: 20 },
  input: { backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, color: theme.bodyText, paddingHorizontal: 12, paddingVertical: 12 },
  scanInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 4 },
  scanInputIcon: { color: theme.goldAccent, fontSize: 18, marginRight: 10 },
  scanInput: { flex: 1, color: theme.bodyText, fontSize: 15, paddingVertical: 14 },
  primaryBtn: { backgroundColor: theme.buttonGreen, paddingVertical: 12, borderRadius: 14, alignItems: 'center', marginTop: 2, borderWidth: 1, borderColor: theme.border },
  primaryBtnLarge: { backgroundColor: theme.buttonGreen, paddingVertical: 14, borderRadius: 16, alignItems: 'center', marginTop: 4, borderWidth: 1, borderColor: theme.border },
  primaryBtnText: { color: isDark ? theme.bodyText : theme.primaryGreen, fontWeight: '800' },
  primaryMiniBtn: { backgroundColor: isDark ? '#3b2a2a' : '#F8DCDD', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: isDark ? '#5c3a3a' : '#EFC5C7' },
  primaryMiniBtnText: { color: isDark ? '#e8baba' : '#6E4A4A', fontWeight: '800', fontSize: 12 },
  secondaryBtnFull: { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
  secondaryBtn: { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, paddingVertical: 12, borderRadius: 12, alignItems: 'center', flex: 1 },
  secondaryBtnText: { color: theme.mutedText, fontWeight: '700' },
  resultTopRow: { flexDirection: 'row', alignItems: 'flex-start' },
  resultTitleWrap: { flex: 1, marginLeft: 12 },
  bigEmoji: { fontSize: 38 },
  itemTitle: { color: theme.bodyText, fontSize: 20, fontWeight: '700', marginBottom: 8 },
  muted: { color: theme.mutedText, lineHeight: 20 },
  detail: { color: theme.bodyText, lineHeight: 21 },
  detailLabel: { fontWeight: '700' },
  badge: (status) => ({ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', color: status === 'recalled' ? (isDark ? '#ff9999' : '#B94E4E') : status === 'safe' ? (isDark ? '#98e6a3' : '#4E8656') : (isDark ? '#ffc987' : '#A96A2D'), fontWeight: '800', backgroundColor: status === 'recalled' ? (isDark ? '#4a1a1a' : '#FAD7D7') : status === 'safe' ? (isDark ? '#1b3b22' : '#DDEDDC') : (isDark ? '#4a3215' : '#F8E2C8') }),
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  metricBox: { flex: 1, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 18, paddingVertical: 14, alignItems: 'center' },
  metricValue: { color: theme.primaryGreen, fontSize: 20, fontWeight: '800' },
  metricLabel: { color: theme.mutedText, fontSize: 11, marginTop: 4 },
  listPad: { paddingBottom: 30, gap: 10 },
  listCard: { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 18, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  listMain: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  listEmoji: { fontSize: 28, marginRight: 10 },
  listTextWrap: { flex: 1 },
  listTitle: { color: theme.bodyText, fontWeight: '700', marginBottom: 3 },
  listMeta: { color: theme.mutedText, fontSize: 12 },
  smallBtn: { backgroundColor: isDark ? '#3b2a2a' : '#F8DCDD', borderWidth: 1, borderColor: isDark ? '#5c3a3a' : '#EFC5C7', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  smallBtnText: { color: isDark ? '#e8baba' : '#6E4A4A', fontSize: 12, fontWeight: '700' },
  emptyText: { color: theme.mutedText, textAlign: 'center', marginTop: 20 },
  emptyStateCard: { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 22, padding: 20, alignItems: 'center', marginTop: 8 },
  emptyStateEmoji: { fontSize: 30, marginBottom: 10 },
  emptyStateTitle: { color: theme.bodyText, fontSize: 18, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  emptyStateText: { color: theme.mutedText, textAlign: 'center', lineHeight: 20 },
  sectionHeaderRow: { marginBottom: 10, marginTop: 6 },
  sectionHeaderTitle: { color: theme.primaryGreen, fontSize: 18, fontWeight: '800' },
  sectionHeaderSub: { color: theme.mutedText, fontSize: 13, marginTop: 2 },
  feedList: { paddingBottom: 8, paddingTop: 2 },
  feedCard: { width: 260, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 20, padding: 14, marginRight: 10 },
  feedTag: { alignSelf: 'flex-start', color: theme.primaryGreen, fontSize: 11, fontWeight: '800', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  feedItemTitle: { color: theme.bodyText, fontSize: 15, fontWeight: '800', marginBottom: 8 },
  feedSummary: { color: theme.mutedText, lineHeight: 18, fontSize: 13 },
  feedDate: { color: theme.mutedText, fontSize: 12, marginTop: 10 },
  postCard: { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 18, padding: 14, marginBottom: 10, gap: 8 },
  postTag: { color: theme.primaryGreen, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: '800' },
  postTitle: { color: theme.bodyText, fontWeight: '800', fontSize: 16 },
  postBody: { color: theme.bodyText, lineHeight: 20 },
  postMeta: { color: theme.mutedText, fontSize: 12 },
  spaceTop: { marginTop: 20 },
  profileHero: { backgroundColor: theme.softGreen, borderWidth: 1, borderColor: theme.border, borderRadius: 24, padding: 18, alignItems: 'center' },
  profileAvatarCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  profileAvatarIcon: { fontSize: 28 },
  profileName: { color: theme.bodyText, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  profileEmail: { color: theme.mutedText, fontSize: 13, marginTop: 4, marginBottom: 4, textAlign: 'center' },
  profilePoints: { color: theme.primaryGreen, fontSize: 36, fontWeight: '800' },
  progressTrack: { height: 10, borderRadius: 999, backgroundColor: theme.background, overflow: 'hidden', marginTop: 8 },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: theme.goldAccent },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.border },
  settingLabel: { color: theme.bodyText, fontWeight: '700' },
  settingValue: { color: theme.mutedText, fontWeight: '600' },
  rewardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  rewardTitle: { color: theme.bodyText, fontWeight: '700' },
  rewardMeta: { color: theme.mutedText, fontSize: 12, marginTop: 2 },
  rewardState: { color: theme.primaryGreen, fontSize: 12, fontWeight: '800' },
  assistantOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', justifyContent: 'flex-end' },
  assistantSheet: { height: '85%', backgroundColor: theme.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 18, paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 40 : 20, borderWidth: 1, borderColor: theme.border },
  assistantHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  assistantTitle: { color: theme.primaryGreen, fontSize: 20, fontWeight: '800' },
  assistantSubtitle: { color: theme.mutedText, fontSize: 12, marginTop: 2 },
  assistantClose: { color: theme.primaryGreen, fontSize: 20, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2 },
  assistantMessages: { flex: 1 },
  assistantMessagesContent: { paddingBottom: 12 },
  chatBubble: { maxWidth: '85%', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 18, marginBottom: 16 },
  userBubble: { backgroundColor: theme.goldAccent, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  assistantBubble: { backgroundColor: theme.card, alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: theme.border, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  chatBubbleText: { fontSize: 16, lineHeight: 24, fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto', letterSpacing: 0.2 },
  userBubbleText: { color: '#121821', fontWeight: '500' },
  assistantBubbleText: { color: theme.bodyText, fontWeight: '400' },
  assistantInputRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 10 },
  assistantInput: { flex: 1, minHeight: 52, maxHeight: 110, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 16, color: theme.bodyText, paddingHorizontal: 14, paddingVertical: 15, marginRight: 10 },
  assistantSendBtn: { backgroundColor: theme.buttonGreen, height: 52, paddingHorizontal: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border },
  assistantSendText: { color: isDark ? theme.bodyText : theme.primaryGreen, fontWeight: '800' },
  communityPageContent: { paddingBottom: 32 },
  communityHeroEyebrow: { color: theme.primaryGreen, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: 8 },
  communityHeroTitle: { color: theme.primaryGreen, fontSize: 25, fontWeight: '800', marginBottom: 6 },
  communityHeroSubtitle: { color: theme.mutedText, fontSize: 15, lineHeight: 22, marginBottom: 18 },
  featuredNewsCard: { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.goldAccent, borderRadius: 24, padding: 18, marginBottom: 18 },
  newsBadge: { alignSelf: 'flex-start', backgroundColor: theme.softGreen, color: isDark ? theme.bodyText : theme.primaryGreen, fontSize: 11, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', marginBottom: 12 },
  featuredNewsTitle: { color: theme.bodyText, fontSize: 22, fontWeight: '800', lineHeight: 30, marginBottom: 10 },
  featuredNewsSummary: { color: theme.mutedText, fontSize: 14, lineHeight: 22 },
  featuredNewsFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  featuredNewsSource: { color: theme.primaryGreen, fontSize: 12, fontWeight: '700' },
  featuredNewsDate: { color: theme.mutedText, fontSize: 12 },
  newsSectionRow: { marginBottom: 12 },
  newsSectionTitle: { color: theme.primaryGreen, fontSize: 20, fontWeight: '800' },
  newsListCard: { flexDirection: 'row', backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 18, padding: 14, marginBottom: 12 },
  newsListLeft: { marginRight: 12, paddingTop: 6 },
  newsDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.goldAccent },
  newsListBody: { flex: 1 },
  newsListTitle: { color: theme.bodyText, fontSize: 15, fontWeight: '700', lineHeight: 21, marginBottom: 6 },
  newsListSummary: { color: theme.mutedText, fontSize: 13, lineHeight: 19 },
  newsMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  newsMetaSource: { color: theme.primaryGreen, fontSize: 12, fontWeight: '700' },
  newsListDate: { color: theme.mutedText, fontSize: 12 },
  newsEmptyCard: { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 24, padding: 22, alignItems: 'center', marginBottom: 18 },
  newsEmptyEmoji: { fontSize: 30, marginBottom: 10 },
  newsEmptyTitle: { color: theme.bodyText, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  newsEmptyText: { color: theme.mutedText, textAlign: 'center', lineHeight: 20 },
  newsEmptySmall: { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 18, padding: 16, marginBottom: 18 },
  newsEmptySmallText: { color: theme.mutedText, textAlign: 'center' },
  communityReportsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 12 },
  communityReportsTitle: { color: theme.primaryGreen, fontSize: 20, fontWeight: '800' },
  communityReportsSubtitle: { color: theme.mutedText, fontSize: 13, marginTop: 2 },
  
  bottomNav: { 
    flexDirection: 'row', 
    backgroundColor: theme.card, 
    borderTopWidth: 1, 
    borderTopColor: theme.border, 
    paddingTop: 12, 
    paddingBottom: Platform.OS === 'ios' ? 10 : 16, // Adjusts for iPhone swipe bar
    justifyContent: 'space-around' 
  },
  bottomNavBtn: { 
    alignItems: 'center', 
    justifyContent: 'center', 
    flex: 1 
  },
  bottomNavText: { 
    fontSize: 10, 
    marginTop: 4, 
    marginBottom:8,
    color: theme.mutedText 
  },
});