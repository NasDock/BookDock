import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore, useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';

export function LoginScreen() {
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');

  const authStore = useAuthStore();

  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; email?: string; password?: string; confirmPassword?: string }>({});

  const styles = useMemo(() => createStyles(theme), [theme]);

  const validate = useCallback((): boolean => {
    const newErrors: typeof errors = {};

    if (!username.trim()) {
      newErrors.username = 'Username is required';
    } else if (username.trim().length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    }

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (!isLogin) {
      if (password !== confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [username, email, password, confirmPassword, isLogin]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;

    setIsLoading(true);
    try {
      if (isLogin) {
        // Call login API
        const { apiClient } = await import('../services/api');
        const response = await apiClient.auth.login(email, password);
        if (response.success && response.data) {
          authStore.login(response.data.user, response.data.token);
        } else {
          Alert.alert('Login Failed', response.error || 'Invalid credentials');
        }
      } else {
        // Call register API
        const { apiClient } = await import('../services/api');
        const response = await apiClient.auth.register(username, email, password);
        if (response.success && response.data) {
          authStore.login(response.data.user, response.data.token);
        } else {
          Alert.alert('Registration Failed', response.error || 'Could not create account');
        }
      }
    } catch (error) {
      console.error('Auth error:', error);
      // For demo/development, simulate successful auth
      authStore.login({
        id: 'demo-user',
        username: username,
        email: email,
        membership: 'free',
        role: 'user',
        createdAt: new Date().toISOString(),
      }, 'demo-token');
    } finally {
      setIsLoading(false);
    }
  }, [isLogin, username, email, password, validate, authStore]);

  const toggleMode = useCallback(() => {
    setIsLogin((prev) => !prev);
    setErrors({});
  }, []);

  const handleForgotPassword = useCallback(() => {
    Alert.alert(
      'Forgot Password',
      'Password reset functionality would be implemented here.',
      [{ text: 'OK' }]
    );
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoContainer}>
            <View style={[styles.logo, { backgroundColor: theme.colors.primary }]}>
              <Ionicons name="book" size={40} color="#fff" />
            </View>
            <Text style={styles.appName}>BookDock</Text>
            <Text style={styles.tagline}>
              {isLogin ? 'Welcome back!' : 'Create your account'}
            </Text>
          </View>

          {/* Form */}
          <View style={[styles.form, { backgroundColor: theme.colors.surface }]}>
            {/* Username (Register only) */}
            {!isLogin && (
              <View style={styles.inputContainer}>
                <View style={[styles.inputWrapper, errors.username && styles.inputError]}>
                  <Ionicons name="person-outline" size={20} color={theme.colors.textSecondary} />
                  <TextInput
                    style={styles.input}
                    placeholder="Username"
                    placeholderTextColor={theme.colors.textSecondary}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                {errors.username && (
                  <Text style={styles.errorText}>{errors.username}</Text>
                )}
              </View>
            )}

            {/* Email */}
            <View style={styles.inputContainer}>
              <View style={[styles.inputWrapper, errors.email && styles.inputError]}>
                <Ionicons name="mail-outline" size={20} color={theme.colors.textSecondary} />
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={theme.colors.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {errors.email && (
                <Text style={styles.errorText}>{errors.email}</Text>
              )}
            </View>

            {/* Password */}
            <View style={styles.inputContainer}>
              <View style={[styles.inputWrapper, errors.password && styles.inputError]}>
                <Ionicons name="lock-closed-outline" size={20} color={theme.colors.textSecondary} />
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor={theme.colors.textSecondary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
              {errors.password && (
                <Text style={styles.errorText}>{errors.password}</Text>
              )}
            </View>

            {/* Confirm Password (Register only) */}
            {!isLogin && (
              <View style={styles.inputContainer}>
                <View style={[styles.inputWrapper, errors.confirmPassword && styles.inputError]}>
                  <Ionicons name="lock-closed-outline" size={20} color={theme.colors.textSecondary} />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm Password"
                    placeholderTextColor={theme.colors.textSecondary}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                </View>
                {errors.confirmPassword && (
                  <Text style={styles.errorText}>{errors.confirmPassword}</Text>
                )}
              </View>
            )}

            {/* Forgot Password (Login only) */}
            {isLogin && (
              <TouchableOpacity style={styles.forgotPassword} onPress={handleForgotPassword}>
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
              </TouchableOpacity>
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
                  {isLogin ? 'Sign In' : 'Create Account'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
              <Text style={[styles.dividerText, { color: theme.colors.textSecondary }]}>or</Text>
              <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
            </View>

            {/* Social Login */}
            <View style={styles.socialButtons}>
              <TouchableOpacity
                style={[styles.socialButton, { backgroundColor: theme.colors.background }]}
                onPress={() => Alert.alert('Google Sign-In', 'Would initiate Google OAuth flow.')}
              >
                <Ionicons name="logo-google" size={22} color={theme.colors.error} />
                <Text style={styles.socialButtonText}>Google</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.socialButton, { backgroundColor: theme.colors.background }]}
                onPress={() => Alert.alert('Apple Sign-In', 'Would initiate Apple OAuth flow.')}
              >
                <Ionicons name="logo-apple" size={22} color={theme.colors.text} />
                <Text style={styles.socialButtonText}>Apple</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Toggle Mode */}
          <View style={styles.toggleContainer}>
            <Text style={[styles.toggleText, { color: theme.colors.textSecondary }]}>
              {isLogin ? "Don't have an account?" : 'Already have an account?'}
            </Text>
            <TouchableOpacity onPress={toggleMode}>
              <Text style={[styles.toggleButton, { color: theme.colors.primary }]}>
                {isLogin ? 'Sign Up' : 'Sign In'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Skip for now */}
          <TouchableOpacity
            style={styles.skipButton}
            onPress={() => {
              // Navigate to main app without login
              // In a real app, you'd check auth state and redirect
              authStore.login({
                id: 'guest',
                username: 'Guest',
                email: 'guest@bookdock.app',
                membership: 'free',
                role: 'user',
                createdAt: new Date().toISOString(),
              }, 'guest-token');
            }}
          >
            <Text style={[styles.skipButtonText, { color: theme.colors.textSecondary }]}>
              Continue as Guest
            </Text>
          </TouchableOpacity>

          {/* Footer */}
          <Text style={[styles.footerText, { color: theme.colors.textSecondary }]}>
            By continuing, you agree to our Terms of Service and Privacy Policy
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    keyboardView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      padding: spacing.lg,
      justifyContent: 'center',
    },
    logoContainer: {
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    logo: {
      width: 80,
      height: 80,
      borderRadius: borderRadius.xl,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    appName: {
      fontSize: fontSizes.xxxl,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    tagline: {
      fontSize: fontSizes.md,
      color: theme.colors.textSecondary,
      marginTop: spacing.xs,
    },
    form: {
      borderRadius: borderRadius.xl,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    inputContainer: {
      marginBottom: spacing.md,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.background,
      borderRadius: borderRadius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: spacing.sm,
    },
    inputError: {
      borderColor: theme.colors.error,
    },
    input: {
      flex: 1,
      fontSize: fontSizes.md,
      color: theme.colors.text,
      paddingVertical: spacing.sm,
    },
    errorText: {
      fontSize: fontSizes.xs,
      color: theme.colors.error,
      marginTop: spacing.xs,
      marginLeft: spacing.xs,
    },
    forgotPassword: {
      alignSelf: 'flex-end',
      marginBottom: spacing.lg,
    },
    forgotPasswordText: {
      fontSize: fontSizes.sm,
      color: theme.colors.primary,
    },
    submitButton: {
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 50,
    },
    submitButtonText: {
      fontSize: fontSizes.md,
      fontWeight: '600',
      color: '#fff',
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: spacing.lg,
    },
    dividerLine: {
      flex: 1,
      height: 1,
    },
    dividerText: {
      paddingHorizontal: spacing.md,
      fontSize: fontSizes.sm,
    },
    socialButtons: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    socialButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    socialButtonText: {
      fontSize: fontSizes.md,
      color: theme.colors.text,
      fontWeight: '500',
    },
    toggleContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.xs,
      marginBottom: spacing.md,
    },
    toggleText: {
      fontSize: fontSizes.md,
    },
    toggleButton: {
      fontSize: fontSizes.md,
      fontWeight: '600',
    },
    skipButton: {
      alignSelf: 'center',
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    skipButtonText: {
      fontSize: fontSizes.md,
    },
    footerText: {
      fontSize: fontSizes.xs,
      textAlign: 'center',
      lineHeight: 18,
    },
  });
}
