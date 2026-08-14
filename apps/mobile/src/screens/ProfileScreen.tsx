import {
  getApiClient,
  type Book,
  type Collection,
  type Note,
} from "@bookdock/api-client";
import AntDesign from "react-native-vector-icons/AntDesign";
import Ionicons from "react-native-vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { RootStackParamList } from "../navigation/types";
import { getCoverImageUrl } from "../services/api";
import { useAuthStore, useLibraryStore, useThemeStore } from "../stores";
import { borderRadius, fontSizes, getTheme, spacing } from "../utils/theme";

import { UpdateModal } from "../components/UpdateModal";
import { useCheckUpdate } from "../hooks/useCheckUpdate";

/**
 * getBookGradient — 1:1 复刻 mobile 旧版的封面渐变色选择逻辑。
 * mobile2 暂不引 react-native-linear-gradient(避免 native 依赖),
 * 用第一色作为纯色背景 + 标题首字母大字号覆盖。视觉接近,后续要恢复渐变再接。
 */
function getBookGradient(title: string): string[] {
  const gradients = [
    ["#3B82F6", "#6366F1"],
    ["#8B5CF6", "#A855F7"],
    ["#06B6D4", "#3B82F6"],
    ["#10B981", "#34D399"],
    ["#F59E0B", "#F97316"],
    ["#EF4444", "#F97316"],
    ["#EC4899", "#F43F5E"],
    ["#6366F1", "#8B5CF6"],
  ];
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

type TabKey = "collections" | "reading" | "favorites" | "downloads" | "notes";

export function ProfileScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === "dark");
  const { user, logout, isVip } = useAuthStore();
  // mobile2 的 useLibraryStore 第一版只暴露 books / fetchBooks / isLoading / error,
  // 暂未引 localBooks。downloads tab 暂时显示空。后续要加本地下载管理再补。
  const { books } = useLibraryStore();

  const [activeTab, setActiveTab] = useState<TabKey>("collections");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [favorites, setFavorites] = useState<Book[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [readingSummary, setReadingSummary] = useState<{
    todaySecs: number;
    weekSecs: number;
    monthSecs: number;
    yearSecs: number;
    totalSecs: number;
  } | null>(null);

  // Fetch reading time summary
  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const api = getApiClient();
        const res = await api.getReadingTimeSummary();
        if (res.success && res.data) {
          setReadingSummary(res.data);
        }
      } catch (err) {
        console.error("Failed to fetch reading summary:", err);
      }
    };
    fetchSummary();
  }, []);

  const {
    checkUpdate,
    progress,
    isUpdating,
    updateInfo,
    startUpdate,
    ignoreUpdate,
    cancelUpdate,
  } = useCheckUpdate();

  const [isUpdateModalVisible, setIsUpdateModalVisible] = useState(false);

  const styles = useMemo(() => createStyles(theme), [theme]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const api = getApiClient();
      // 收藏 / 笔记 / 全量同步接口:mobile 旧版走 @bookdock/api-client 的
      // getFavorites / getNotes / syncBooks。api-client workspace 包里都有,
      // 失败静默 skip(避免单个接口失败导致整屏 loading 退不掉)
      const [colRes, favRes, notesRes] = await Promise.all([
        api.getCollections().catch(() => ({ success: false, data: [] } as any)),
        api.getFavorites().catch(() => ({ success: false, data: [] } as any)),
        api.getNotes().catch(() => ({ success: false, data: { items: [] } } as any)),
      ]);
      if (colRes.success && colRes.data) setCollections(colRes.data as any);
      if (favRes.success && favRes.data) setFavorites(favRes.data as any);
      if (notesRes.success && notesRes.data) {
        const data: any = notesRes.data;
        setNotes((data.items || data) as any);
      }
    } catch (err) {
      console.error("Failed to fetch profile data:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    checkUpdate();
  }, []);

  useEffect(() => {
    if (updateInfo) {
      setIsUpdateModalVisible(true);
    }
  }, [updateInfo]);

  const inProgressBooks = useMemo(
    () =>
      books.filter(
        (b) => (b.readingProgress ?? 0) > 0 && (b.readingProgress ?? 0) < 100,
      ),
    [books],
  );

  // mobile2 第一版不引 localBooks(react-native-fs 离线下载管理),下载 tab 暂时空。
  const downloadedBooks: Book[] = useMemo(() => [], []);

  const handleCreateCollection = useCallback(async () => {
    if (!newCollectionName.trim()) {
      Alert.alert("提示", "请输入书单名称");
      return;
    }
    try {
      const api = getApiClient();
      await api.createCollection({ name: newCollectionName.trim() });
      setNewCollectionName("");
      setShowCreateModal(false);
      fetchData();
    } catch {
      Alert.alert("错误", "创建书单失败");
    }
  }, [newCollectionName, fetchData]);

  const handleSync = useCallback(async (type: "full" | "incremental") => {
    const title = type === "full" ? "全量更新" : "增量更新";
    Alert.alert(
      title,
      type === "full" ? "扫描所有本地书籍..." : "仅扫描新数据...",
      [
        { text: "取消", style: "cancel" },
        {
          text: "确认",
          onPress: async () => {
            setSyncing(type);
            try {
              const api = getApiClient();
              const res = await api.syncBooks(type);
              const msg = (res.data as any)?.message || "更新成功";
              Alert.alert("同步完成", msg);
            } catch (e: any) {
              Alert.alert("同步失败", e?.response?.data?.message || "请求失败");
            } finally {
              setSyncing(null);
              setMenuVisible(false);
            }
          },
        },
      ],
    );
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <View
          style={{ flexDirection: "row", alignItems: "center", marginLeft: 16 }}
        >
          <TouchableOpacity
            style={{
              width: 40,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
            }}
            onPress={() => setMenuVisible(true)}
          >
            <Ionicons name="add" size={26} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
      ),
      headerRight: () => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginRight: 16,
          }}
        >
          <TouchableOpacity
            style={{
              width: 40,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
            }}
            onPress={() => navigation.navigate("ScanLogin")}
          >
            <AntDesign name="scan" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              width: 40,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
            }}
            onPress={() => navigation.navigate("Settings")}
          >
            <Ionicons
              name="settings-outline"
              size={24}
              color={theme.colors.text}
            />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, theme, progress]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "collections", label: "书单" },
    { key: "reading", label: "在读" },
    { key: "favorites", label: "收藏" },
    { key: "downloads", label: "下载" },
    { key: "notes", label: "笔记" },
  ];

  const renderBookCard = (book: Book) => (
    <TouchableOpacity
      key={book.id}
      style={[styles.bookCard, { backgroundColor: theme.colors.surface }]}
      onPress={() => navigation.navigate("BookDetails", { book })}
      activeOpacity={0.8}
    >
      <View style={styles.coverContainer}>
        {book.coverUrl ? (
          <Image
            source={{ uri: getCoverImageUrl(book.coverUrl) }}
            style={styles.coverImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.coverImage, { backgroundColor: getBookGradient(book.title)[0] }]}>
            <Text style={styles.coverLetter}>{book.title.charAt(0)}</Text>
          </View>
        )}
      </View>
      <View style={styles.bookInfo}>
        <Text
          style={[styles.bookTitle, { color: theme.colors.text }]}
          numberOfLines={2}
        >
          {book.title}
        </Text>
        <Text
          style={[styles.bookAuthor, { color: theme.colors.textSecondary }]}
        >
          {book.author || "未知作者"}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      );
    }

    switch (activeTab) {
      case "collections":
        return (
          <View style={styles.listContainer}>
            {collections.length === 0 ? (
              <Text
                style={[
                  styles.emptyText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                暂无书单
              </Text>
            ) : (
              collections.map((col) => (
                <TouchableOpacity
                  key={col.id}
                  style={[
                    styles.collectionCard,
                    { backgroundColor: theme.colors.surface },
                  ]}
                  onPress={() =>
                    navigation.navigate("CollectionDetail", {
                      collectionId: col.id,
                    })
                  }
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="folder-open-outline"
                    size={32}
                    color={theme.colors.primary}
                  />
                  <View style={styles.collectionInfo}>
                    <Text
                      style={[
                        styles.collectionName,
                        { color: theme.colors.text },
                      ]}
                      numberOfLines={1}
                    >
                      {col.name}
                    </Text>
                    <Text
                      style={[
                        styles.collectionMeta,
                        { color: theme.colors.textSecondary },
                      ]}
                    >
                      {col.bookCount} 本书
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              ))
            )}
          </View>
        );
      case "reading":
        return (
          <View style={styles.listContainer}>
            {inProgressBooks.length === 0 ? (
              <Text
                style={[
                  styles.emptyText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                暂无在读书籍
              </Text>
            ) : (
              inProgressBooks.map(renderBookCard)
            )}
          </View>
        );
      case "favorites":
        return (
          <View style={styles.listContainer}>
            {favorites.length === 0 ? (
              <Text
                style={[
                  styles.emptyText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                暂无收藏
              </Text>
            ) : (
              favorites.map(renderBookCard)
            )}
          </View>
        );
      case "downloads":
        return (
          <View style={styles.listContainer}>
            {downloadedBooks.length === 0 ? (
              <Text
                style={[
                  styles.emptyText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                暂无下载
              </Text>
            ) : (
              downloadedBooks.map((b) => renderBookCard(b as unknown as Book))
            )}
          </View>
        );
      case "notes":
        return (
          <View style={styles.listContainer}>
            {notes.length === 0 ? (
              <Text
                style={[
                  styles.emptyText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                暂无笔记
              </Text>
            ) : (
              notes.map((note) => (
                <View
                  key={note.id}
                  style={[
                    styles.noteCard,
                    { backgroundColor: theme.colors.surface },
                  ]}
                >
                  <View style={styles.noteHeader}>
                    <Text
                      style={[
                        styles.noteBookTitle,
                        { color: theme.colors.text },
                      ]}
                      numberOfLines={1}
                    >
                      {note.bookTitle || "未知书籍"}
                    </Text>
                    <Text
                      style={[
                        styles.noteAuthor,
                        { color: theme.colors.textSecondary },
                      ]}
                    >
                      {note.author || "未知作者"}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.noteTextBox,
                      { backgroundColor: theme.colors.background },
                    ]}
                  >
                    <Text
                      style={[styles.noteText, { color: theme.colors.text }]}
                    >
                      {note.text}
                    </Text>
                  </View>
                  {note.note && (
                    <Text
                      style={[
                        styles.noteContent,
                        { color: theme.colors.textSecondary },
                      ]}
                    >
                      {note.note}
                    </Text>
                  )}
                  <Text
                    style={[
                      styles.noteDate,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    {new Date(note.createdAt).toLocaleString("zh-CN")}
                  </Text>
                </View>
              ))
            )}
          </View>
        );
    }
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View
            style={[styles.avatar, { backgroundColor: theme.colors.primary }]}
          >
            <Text style={styles.avatarText}>
              {user?.username?.charAt(0).toUpperCase() || "U"}
            </Text>
          </View>
          <View style={styles.usernameRow}>
            <Text style={styles.username}>{user?.username || "用户"}</Text>
            <TouchableOpacity
              onPress={async () => {
                const plusToken = await AsyncStorage.getItem(
                  "bookdock_plus_token",
                );
                if (!plusToken) {
                  navigation.navigate("MemberLogin");
                  return;
                }
                navigation.navigate(isVip ? "MemberDetail" : "MemberBenefits");
              }}
            >
              <Ionicons
                name={isVip ? "diamond" : "diamond-outline"}
                size={20}
                color={isVip ? "#FFD700" : theme.colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Reading Time Card */}
        {isVip ? (
          readingSummary && (
            <TouchableOpacity
              style={[
                styles.readingTimeCard,
                { backgroundColor: theme.colors.primary },
              ]}
              onPress={() => navigation.navigate("Stats")}
            >
              <View style={styles.readingTimeContent}>
                <Ionicons name="time-outline" size={24} color="#fff" />
                <View style={styles.readingTimeTextContainer}>
                  <Text style={styles.readingTimeLabel}>阅读时长</Text>
                  <Text style={styles.readingTimeValue}>
                    {(() => {
                      const format = (secs: number) => {
                        if (secs < 60) return `${secs}秒`;
                        if (secs < 3600) return `${Math.floor(secs / 60)}分钟`;
                        const h = Math.floor(secs / 3600);
                        const m = Math.floor((secs % 3600) / 60);
                        return m > 0 ? `${h}小时${m}分钟` : `${h}小时`;
                      };
                      if (readingSummary.todaySecs > 0) {
                        return `今日阅读 ${format(readingSummary.todaySecs)}`;
                      }
                      if (readingSummary.weekSecs > 0) {
                        return `本周阅读 ${format(readingSummary.weekSecs)}`;
                      }
                      if (readingSummary.monthSecs > 0) {
                        return `本月阅读 ${format(readingSummary.monthSecs)}`;
                      }
                      if (readingSummary.yearSecs > 0) {
                        return `今年阅读 ${format(readingSummary.yearSecs)}`;
                      }
                      return "今日还没有阅读";
                    })()}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </TouchableOpacity>
          )
        ) : (
          <TouchableOpacity
            style={[
              styles.readingTimeCard,
              { backgroundColor: theme.colors.textSecondary },
            ]}
            onPress={() => navigation.navigate("MemberBenefits")}
          >
            <View style={styles.readingTimeContent}>
              <Ionicons name="diamond-outline" size={24} color="#fff" />
              <View style={styles.readingTimeTextContainer}>
                <Text style={styles.readingTimeLabel}>阅读时长</Text>
                <Text style={styles.readingTimeValue}>
                  开通会员解锁阅读时长统计
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Tabs */}
        <View
          style={[styles.tabBar, { backgroundColor: theme.colors.surface }]}
        >
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tabItem,
                activeTab === tab.key && {
                  borderBottomColor: theme.colors.primary,
                },
              ]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color:
                      activeTab === tab.key
                        ? theme.colors.primary
                        : theme.colors.textSecondary,
                  },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        {renderContent()}
      </ScrollView>

      {/* Add Menu Modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.3)" }}
          onPress={() => setMenuVisible(false)}
        >
          <View
            style={[styles.menu, { backgroundColor: theme.colors.surface }]}
          >
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                setShowCreateModal(true);
              }}
            >
              <Ionicons
                name="folder-open-outline"
                size={18}
                color={theme.colors.text}
              />
              <Text
                style={{ fontSize: fontSizes.md, color: theme.colors.text }}
              >
                新建书单
              </Text>
            </TouchableOpacity>
            <View
              style={{
                height: 1,
                backgroundColor: theme.colors.border,
                marginHorizontal: spacing.md,
              }}
            />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleSync("incremental")}
              disabled={!!syncing}
            >
              <Ionicons
                name="add-circle-outline"
                size={18}
                color={theme.colors.text}
              />
              <Text
                style={{ fontSize: fontSizes.md, color: theme.colors.text }}
              >
                增量更新
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleSync("full")}
              disabled={!!syncing}
            >
              <Ionicons
                name="refresh-circle-outline"
                size={18}
                color={theme.colors.text}
              />
              <Text
                style={{ fontSize: fontSizes.md, color: theme.colors.text }}
              >
                全量更新
              </Text>
            </TouchableOpacity>
            {user?.role === "admin" && (
              <>
                <View
                  style={{
                    height: 1,
                    backgroundColor: theme.colors.border,
                    marginHorizontal: spacing.md,
                  }}
                />
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuVisible(false);
                    navigation.navigate("AdminUsers");
                  }}
                >
                  <Ionicons
                    name="people-outline"
                    size={18}
                    color={theme.colors.text}
                  />
                  <Text
                    style={{ fontSize: fontSizes.md, color: theme.colors.text }}
                  >
                    用户管理
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      <UpdateModal
        visible={isUpdateModalVisible}
        progress={progress}
        isUpdating={isUpdating}
        updateInfo={updateInfo}
        onBackground={() => setIsUpdateModalVisible(false)}
        onUpdate={startUpdate}
        onIgnore={() => {
          ignoreUpdate();
          setIsUpdateModalVisible(false);
        }}
        onCancel={() => {
          cancelUpdate();
          setIsUpdateModalVisible(false);
        }}
      />

      {/* Create Collection Modal */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
              新建书单
            </Text>
            <TextInput
              style={[
                styles.input,
                { color: theme.colors.text, borderColor: theme.colors.border },
              ]}
              placeholder="书单名称"
              placeholderTextColor={theme.colors.textSecondary}
              value={newCollectionName}
              onChangeText={setNewCollectionName}
            />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  { backgroundColor: theme.colors.border },
                ]}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={{ color: theme.colors.text }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  { backgroundColor: theme.colors.primary },
                ]}
                onPress={handleCreateCollection}
              >
                <Text style={{ color: "#fff" }}>创建</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      padding: spacing.md,
      gap: spacing.md,
    },
    center: {
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
    },
    profileHeader: {
      alignItems: "center",
      paddingVertical: 0,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.lg,
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      fontSize: fontSizes.xxxl,
      fontWeight: "bold",
      color: "#fff",
    },
    usernameRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: spacing.md,
      gap: spacing.xs,
    },
    username: {
      fontSize: fontSizes.xl,
      fontWeight: "700",
      color: theme.colors.text,
    },
    tabBar: {
      flexDirection: "row",
      borderRadius: borderRadius.lg,
      overflow: "hidden",
    },
    tabItem: {
      flex: 1,
      alignItems: "center",
      paddingVertical: spacing.md,
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    tabText: {
      fontSize: fontSizes.md,
      fontWeight: "500",
    },
    listContainer: {
      gap: spacing.sm,
    },
    collectionCard: {
      flexDirection: "row",
      alignItems: "center",
      padding: spacing.md,
      borderRadius: borderRadius.md,
      gap: spacing.sm,
    },
    collectionInfo: {
      flex: 1,
    },
    collectionName: {
      fontSize: fontSizes.md,
      fontWeight: "500",
    },
    collectionMeta: {
      fontSize: fontSizes.sm,
      marginTop: 2,
    },
    bookCard: {
      flexDirection: "row",
      alignItems: "center",
      padding: spacing.sm,
      borderRadius: borderRadius.md,
    },
    coverContainer: {
      width: 60,
      height: 90,
      borderRadius: borderRadius.sm,
      overflow: "hidden",
    },
    coverImage: {
      width: "100%",
      height: "100%",
      justifyContent: "center",
      alignItems: "center",
    },
    coverLetter: {
      fontSize: 24,
      fontWeight: "bold",
      color: "#fff",
    },
    bookInfo: {
      flex: 1,
      marginLeft: spacing.sm,
    },
    bookTitle: {
      fontSize: fontSizes.md,
      fontWeight: "500",
    },
    bookAuthor: {
      fontSize: fontSizes.sm,
      marginTop: 2,
    },
    emptyText: {
      textAlign: "center",
      padding: spacing.xl,
      fontSize: fontSizes.md,
    },
    logoutButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      gap: spacing.sm,
    },
    logoutText: {
      fontSize: fontSizes.md,
      fontWeight: "500",
    },
    menu: {
      position: "absolute",
      top: 60,
      left: 16,
      width: 180,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 5,
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      padding: spacing.md,
    },
    modalContent: {
      width: "80%",
      padding: spacing.lg,
      borderRadius: borderRadius.lg,
      gap: spacing.md,
    },
    modalTitle: {
      fontSize: fontSizes.lg,
      fontWeight: "600",
      textAlign: "center",
    },
    input: {
      borderWidth: 1,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      fontSize: fontSizes.md,
    },
    modalButton: {
      flex: 1,
      alignItems: "center",
      padding: spacing.md,
      borderRadius: borderRadius.md,
    },
    noteCard: {
      padding: spacing.md,
      borderRadius: borderRadius.md,
      gap: spacing.sm,
    },
    noteHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    noteBookTitle: {
      fontSize: fontSizes.md,
      fontWeight: "600",
      flex: 1,
    },
    noteAuthor: {
      fontSize: fontSizes.sm,
    },
    noteTextBox: {
      padding: spacing.sm,
      borderRadius: borderRadius.sm,
      borderLeftWidth: 3,
      borderLeftColor: theme.colors.primary,
    },
    noteText: {
      fontSize: fontSizes.sm,
      lineHeight: 20,
      fontStyle: "italic",
    },
    noteContent: {
      fontSize: fontSizes.sm,
      lineHeight: 20,
    },
    noteDate: {
      fontSize: fontSizes.xs,
      marginTop: spacing.xs,
    },
    readingTimeCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 0,
      padding: spacing.lg,
      borderRadius: borderRadius.lg,
    },
    readingTimeContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    readingTimeTextContainer: {
      gap: spacing.xs,
    },
    readingTimeLabel: {
      fontSize: fontSizes.sm,
      color: "#fff",
      opacity: 0.8,
    },
    readingTimeValue: {
      fontSize: fontSizes.md,
      color: "#fff",
      fontWeight: "600",
    },
  });
}
