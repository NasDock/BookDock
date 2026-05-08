import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { useThemeStore } from '../stores';
import { getApiClient, initApiClient } from '@bookdock/api-client';

type Mode = 'login' | 'register';

export function LoginScreen() {
  const navigation = useNavigation();
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');

  const authStore = useAuthStore();

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const styles = useMemo(() => createStyles(theme), [theme]);

  // Initialize API client on mount
  const apiBaseUrl = 'http://localhost:8080/api'; // TODO: make configurable
  initApiClient({
    baseURL: apiBaseUrl,
    getAuthToken: () => useAuthStore.getState().token || null,
    onAuthError: () => {
      authStore.logout();
    },
  });

  const handleSubmit = useCallback(async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Please enter a username');
      return;
    }
    if (!password.trim()) {
      Alert.alert('Error', 'Please enter a password');
      return;
    }

    if (mode === 'register') {
      if (!email.trim()) {
        Alert.alert('Error', 'Please enter an email');
        return;
      }
      if (password.length < 6) {
        Alert.alert('Error', 'Password must be at least 6 characters');
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert('Error', 'Passwords do not match');
        return;
      }
    }

    setIsLoading(true);
    try {
      const apiClient = getApiClient();

      if (mode === 'login') {
        const response = await apiClient.login(username.trim(), password);
        if (response.success && response.data) {
          const { token, user } = response.data;
          authStore.login(user, token);
          // @ts-ignore
          navigation.replace('Main');
        } else {
          Alert.alert('Login Failed', response.error || 'Invalid credentials');
        }
      } else {
        const response = await apiClient.register(
          username.trim(),
          password,
          email.trim()
        );
        if (response.success && response.data) {
          const { token, user } = response.data;
          authStore.login(user, token);
          // @ts-ignore
          navigation.replace('Main');
        } else {
          Alert.alert('Registration Failed', response.error || 'Please try again');
        }
      }
    } catch (error) {
      Alert.alert(
        'Error',
        (error as Error).message || 'Network error. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [mode, username, email, password, confirmPassword, authStore, navigation]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={[styles.logo, { backgroundColor: theme.colors.primary }]}>
            <Ionicons name="book" size={48} color="#fff" />
          </View>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            BookDock
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            Your Personal Library
          </Text>
        </View>

        {/* Form */}
        <View style={[styles.formContainer, { backgroundColor: theme.colors.surface }]}>
          {/* Mode Toggle */}
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[
                styles.modeButton,
                mode === 'login' && { backgroundColor: theme.colors.primary + '20' },
              ]}
              onPress={() => setMode('login')}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  { color: mode === 'login' ? theme.colors.primary : theme.colors.textSecondary },
                ]}
              >
                Sign In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeButton,
                mode === 'register' && { backgroundColor: theme.colors.primary + '20' },
              ]}
              onPress={() => setMode('register')}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  { color: mode === 'register' ? theme.colors.primary : theme.colors.textSecondary },
                ]}
              >
                Sign Up
              </Text>
            </TouchableOpacity>
          </View>

          {/* Username */}
          <View style={styles.inputContainer}>
            <Ionicons name="person-outline" size={20} color={theme.colors.textSecondary} />
            <TextInput
              style={[styles.input, { color: theme.colors.text }]}
              placeholder="Username"
              placeholderTextColor={theme.colors.textSecondary}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Email (register only) */}
          {mode === 'register' && (
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color={theme.colors.textSecondary} />
              <TextInput
                style={[styles.input, { color: theme.colors.text }]}
                placeholder="Email"
                placeholderTextColor={theme.colors.textSecondary}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>
          )}

          {/* Password */}
          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color={theme.colors.textSecondary} />
            <TextInput
              style={[styles.input, { color: theme.colors.text, flex: 1 }]}
              placeholder="Password"
              placeholderTextColor={theme.colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* Confirm Password (register only) */}
          {mode === 'register' && (
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color={theme.colors.textSecondary} />
              <TextInput
                style={[styles.input, { color: theme.colors.text, flex: 1 }]}
                placeholder="Confirm Password"
                placeholderTextColor={theme.colors.textSecondary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
              />
            </View>
          )}

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: theme.colors.primary }]}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>
                {mode === 'login' ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: spacing.lg,
    },
    logoContainer: {
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    logo: {
      width: 80,
      height: 80,
      borderRadius: borderRadius.xl,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    title: {
      fontSize: fontSizes.xxxl,
      fontWeight: '700',
    },
    subtitle: {
      fontSize: fontSizes.md,
      marginTop: spacing.xs,
    },
    formContainer: {
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
    },
    modeToggle: {
      flexDirection: 'row',
      marginBottom: spacing.lg,
      borderRadius: borderRadius.md,
      overflow: 'hidden',
    },
    modeButton: {
      flex: 1,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    modeButtonText: {
      fontSize: fontSizes.md,
      fontWeight: '600',
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
      height: 48,
    },
    input: {
      flex: 1,
      marginLeft: spacing.sm,
      fontSize: fontSizes.md,
    },
    submitButton: {
      height: 48,
      borderRadius: borderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.sm,
    },
    submitButtonText: {
      color: '#fff',
      fontSize: fontSizes.md,
      fontWeight: '600',
    },
  });
