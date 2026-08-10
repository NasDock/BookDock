# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# =======================================================
# 通用属性：保留注解、泛型签名、内部类，供反射 / JNI 使用
# =======================================================
-keepattributes Signature,*Annotation*,InnerClasses,EnclosingMethod,SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# =======================================================
# React Native / Hermes / JNI / Yoga / Soloader
# R8 会误删走 native 的类，必须全 keep
# =======================================================
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep,allowobfuscation @interface com.facebook.common.internal.DoNotStrip

-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keep @com.facebook.common.internal.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.common.internal.DoNotStrip *;
}

-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.soloader.** { *; }
-keep class com.facebook.yoga.** { *; }
-keep class com.facebook.proguard.annotations.** { *; }
-keep class com.facebook.systrace.** { *; }
-keep class com.facebook.debug.** { *; }

# React Native Modules 反射入口
-keep class com.facebook.react.modules.** { *; }
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.uimanager.** { *; }
-keep class com.facebook.react.devsupport.** { *; }
-keep class com.facebook.react.views.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.react.fabric.** { *; }

# JNI 暴露的 native 方法
-keepclasseswithmembernames class * {
    native <methods>;
}

# =======================================================
# Expo Modules（Expo 52 SDK，ABI 多版本桥接类）
# =======================================================
-keep class expo.modules.** { *; }
-keep class abi52_0_0.host.exp.exponent.modules.** { *; }
-keep class abi52_0_0.expo.modules.** { *; }
-keep class abi51_0_0.host.exp.exponent.modules.** { *; }
-keep class abi51_0_0.expo.modules.** { *; }
-keep class abi50_0_0.host.exp.exponent.modules.** { *; }
-keep class abi50_0_0.expo.modules.** { *; }

# Expo 各模块单独 keep
-keep class expo.modules.camera.** { *; }
-keep class expo.modules.av.** { *; }
-keep class expo.modules.filesystem.** { *; }
-keep class expo.modules.font.** { *; }
-keep class expo.modules.securestore.** { *; }
-keep class expo.modules.notifications.** { *; }
-keep class expo.modules.splashscreen.** { *; }
-keep class expo.modules.statusbar.** { *; }
-keep class expo.modules.intentlauncher.** { *; }
-keep class expo.modules.lineargradient.** { *; }
-keep class expo.modules.navigationbar.** { *; }
-keep class expo.modules.webbrowser.** { *; }
-keep class expo.modules.sharing.** { *; }

# =======================================================
# 第三方原生模块（按项目依赖精准 keep）
# =======================================================

# react-native-screens
-keep class com.swmansion.rnscreens.** { *; }

# react-native-safe-area-context
-keep class com.th3rdwave.safeareacontext.** { *; }

# react-native-track-player
-keep class com.doublesymmetry.trackplayer.** { *; }
-keep class com.doublesymmetry.kotlinaudio.** { *; }

# react-native-blob-util
-keep class com.ReactNativeBlob.** { *; }
-keep class com.reactnativecommunity.blobutil.** { *; }

# react-native-pdf (基于 PdfiumAndroid)
-keep class com.shockpdf.** { *; }
-keep class com.shockwave.** { *; }

# react-native-webview
-keep class com.reactnativecommunity.webview.** { *; }

# @react-native-async-storage/async-storage
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# @react-native-community/netinfo
-keep class com.reactnativecommunity.netinfo.** { *; }

# @react-native-community/slider
-keep class com.reactnativecommunity.slider.** { *; }

# react-native-svg（如果用到了，路径以防万一）
-keep class com.horcrux.svg.** { *; }

# react-native-reanimated（原有保留）
-keep class com.swmansion.reanimated.** { *; }

# react-native-gesture-handler
-keep class com.swmansion.gesturehandler.** { *; }

# =======================================================
# Expo Autolinking 默认生成的 keep（兜底）
# =======================================================
-keep class host.exp.exponent.** { *; }
-keep class com.bookdock.app.MainApplication { *; }
-keep class com.bookdock.app.MainActivity { *; }
-keep class com.bookdock.app.ReactNativeHost { *; }

# =======================================================
# 其他
# =======================================================

# OkHttp / Okio（部分 RN 网络栈使用）
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**

# 防止 Parcelable 子类 remove 导致问题
-keepclassmembers class * implements android.os.Parcelable {
    public static final ** CREATOR;
}

# View 子类构造器参数（RN 视图系统反射）
-keepclasseswithmembers class * extends android.view.View {
    public <init>(android.content.Context, android.util.AttributeSet);
    public <init>(android.content.Context, android.util.AttributeSet, int);
}
