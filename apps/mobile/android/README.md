# BookDock 移动端 Android 构建说明

## Maven 仓库镜像（国内加速）

`init-aliyun-mirror.gradle` 是给国内开发者用的 Gradle init script，把不可达/慢的仓库
（oss.sonatype.org、Maven Central 等）替换为阿里云镜像，规避 504 超时。

### 两种使用方式

#### 方式 A：机器级（推荐，自动生效）

```bash
mkdir -p ~/.gradle/init.d
cp apps/mobile/android/init-aliyun-mirror.gradle ~/.gradle/init.d/
```

Gradle 会自动加载 `~/.gradle/init.d/` 下所有 `.gradle` 文件，无需额外配置。
对当前用户的所有 Gradle 项目生效。

#### 方式 B：项目级（单次构建）

```bash
cd apps/mobile/android
./gradlew --init-script init-aliyun-mirror.gradle :app:assembleRelease
```

只对当前构建生效。

## 包体积优化

详见 commit 历史：

- `6265c94` — 主体瘦身（ABI 裁剪、WebP logo、R8、Bitcode、依赖裁剪）
- `66be0c5` — 手动声明 `ndk.abiFilters`，确保 ABI 裁剪生效

**结果**：app-release.apk 从 80MB+ 降至 **39.6 MB**（减少约 50%）。

## 构建命令

```bash
export JAVA_HOME="/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
./gradlew :app:assembleRelease
```

产物：`app/build/outputs/apk/release/app-release.apk`