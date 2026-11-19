// [API 23+] screens/ApiTokensScreen.ets — 对齐 mobile ApiTokensScreen.tsx / desktop ApiTokens.tsx
// API 令牌管理:列表 / 创建(明文仅一次) / 改名 / 启停 / 删除。
// 令牌用于 NAS、脚本等设备访问书仓内容(账号信息除外);管理接口本身只允许 JWT。
import { promptAction } from '@kit.ArkUI';
import { getTheme, Theme, spacing, fontSizes, borderRadius, ThemeStore } from '../theme/Theme';
import {
  ApiKey,
  CreatedApiKey,
  CreateApiKeyDto,
  UpdateApiKeyDto
} from '../model/ApiModels';
import { getApiClient } from '../network/ApiClient';

@Component
export struct ApiTokensScreen {
  @State private keys: ApiKey[] = [];
  @State private loading: boolean = true;

  // 创建弹窗
  @State private showCreateModal: boolean = false;
  @State private newName: string = '';
  @State private expiresInDays: string = '0';
  @State private creating: boolean = false;

  // 明文展示(仅一次)
  @State private createdToken: string = '';
  @State private showTokenModal: boolean = false;

  // 改名弹窗
  @State private showRenameModal: boolean = false;
  @State private renameId: string = '';
  @State private renameName: string = '';

  // 主题镜像
  @State private themeBg: string = '#FFFFFF';
  @State private themeSurface: string = '#F3F4F6';
  @State private themeText: string = '#1F2937';
  @State private themeTextSec: string = '#6B7280';
  @State private themeBorder: string = '#E5E7EB';
  @State private themePrimary: string = '#4A90D9';
  @State private themeError: string = '#EF4444';
  @State private themeSuccess: string = '#10B981';

  aboutToAppear(): void {
    this.applyTheme();
    void this.load();
  }

  private applyTheme(): void {
    const t: Theme = ThemeStore.shared().getCurrentTheme();
    this.themeBg = t.colors.background;
    this.themeSurface = t.colors.surface;
    this.themeText = t.colors.text;
    this.themeTextSec = t.colors.textSecondary;
    this.themeBorder = t.colors.border;
    this.themePrimary = t.colors.primary;
    this.themeError = t.colors.error;
    this.themeSuccess = t.colors.success;
  }

  private formatDate(value: string | null): string {
    if (value === null || value.length === 0) {
      return '永不过期';
    }
    const d: Date = new Date(value);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }


  private async load(): Promise<void> {
    this.loading = true;
    try {
      const res = await getApiClient().getApiKeys();
      if (res.success) {
        this.keys = res.data ?? [];
      } else {
        promptAction.showToast({ message: res.error ?? res.message ?? '加载失败' });
      }
    } catch (e) {
      const msg: string = e instanceof Error ? e.message : '操作失败，请稍后重试';
      promptAction.showToast({ message: msg });
    } finally {
      this.loading = false;
    }
  }

  private async handleCreate(): Promise<void> {
    if (this.newName.trim().length === 0) {
      return;
    }
    this.creating = true;
    try {
      const dto: CreateApiKeyDto = {
        name: this.newName.trim(),
        expiresInDays: Number(this.expiresInDays) || 0
      };
      const res = await getApiClient().createApiKey(dto);
      if (res.success && res.data !== undefined) {
        const created: CreatedApiKey = res.data;
        this.createdToken = created.token;
        this.showCreateModal = false;
        this.showTokenModal = true;
        this.newName = '';
        this.expiresInDays = '0';
        void this.load();
      } else {
        promptAction.showToast({ message: res.error ?? res.message ?? '创建失败' });
      }
    } catch (e) {
      const msg: string = e instanceof Error ? e.message : '操作失败，请稍后重试';
      promptAction.showToast({ message: msg });
    } finally {
      this.creating = false;
    }
  }

  private async handleToggle(key: ApiKey): Promise<void> {
    try {
      const dto: UpdateApiKeyDto = { isActive: !key.isActive };
      const res = await getApiClient().updateApiKey(key.id, dto);
      if (res.success) {
        void this.load();
      } else {
        promptAction.showToast({ message: res.error ?? res.message ?? '操作失败' });
      }
    } catch (e) {
      const msg: string = e instanceof Error ? e.message : '操作失败，请稍后重试';
      promptAction.showToast({ message: msg });
    }
  }

  private async handleRename(): Promise<void> {
    if (this.renameName.trim().length === 0) {
      return;
    }
    try {
      const dto: UpdateApiKeyDto = { name: this.renameName.trim() };
      const res = await getApiClient().updateApiKey(this.renameId, dto);
      if (res.success) {
        this.showRenameModal = false;
        void this.load();
      } else {
        promptAction.showToast({ message: res.error ?? res.message ?? '保存失败' });
      }
    } catch (e) {
      const msg: string = e instanceof Error ? e.message : '操作失败，请稍后重试';
      promptAction.showToast({ message: msg });
    }
  }

  private handleDelete(key: ApiKey): void {
    promptAction.showDialog({
      title: '删除令牌',
      message: `确定删除「${key.name}」吗？使用此令牌的应用将立即无法访问。`,
      buttons: [
        { text: '取消', color: this.themeTextSec },
        { text: '删除', color: this.themeError }
      ]
    }).then((res: promptAction.ShowDialogSuccessResponse): void => {
      if (res.index === 1) {
        void this.doDelete(key);
      }
    });
  }

  private async doDelete(key: ApiKey): Promise<void> {
    try {
      const res = await getApiClient().deleteApiKey(key.id);
      if (res.success) {
        void this.load();
      } else {
        promptAction.showToast({ message: res.error ?? res.message ?? '删除失败' });
      }
    } catch (e) {
      const msg: string = e instanceof Error ? e.message : '操作失败，请稍后重试';
      promptAction.showToast({ message: msg });
    }
  }

  @Builder
  TokenCard(key: ApiKey) {
    Column({ space: spacing.xs }) {
      Row() {
        Text('🔑').fontSize(18)
        Text(key.name)
          .fontSize(fontSizes.md)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.themeText)
          .layoutWeight(1)
          .margin({ left: spacing.sm })
        Text(key.isActive ? '启用' : '已停用')
          .fontSize(11)
          .fontColor(key.isActive ? this.themeSuccess : this.themeTextSec)
          .backgroundColor(key.isActive ? '#dcfce7' : this.themeBorder)
          .borderRadius(10)
          .padding({ left: 8, right: 8, top: 2, bottom: 2 })
      }
      .width('100%')

      Text(`创建于 ${this.formatDate(key.createdAt)}`)
        .fontSize(fontSizes.xs).fontColor(this.themeTextSec).width('100%')
      Text(`到期 ${this.formatDate(key.expiresAt)}`)
        .fontSize(fontSizes.xs).fontColor(this.themeTextSec).width('100%')
      Text(key.lastUsedAt !== null ? `最近使用 ${this.formatDate(key.lastUsedAt)}` : '从未使用')
        .fontSize(fontSizes.xs).fontColor(this.themeTextSec).width('100%')

      Row({ space: spacing.lg }) {
        Text('改名')
          .fontSize(fontSizes.sm)
          .fontColor(this.themePrimary)
          .onClick((): void => {
            this.renameId = key.id;
            this.renameName = key.name;
            this.showRenameModal = true;
          })
        Text(key.isActive ? '停用' : '启用')
          .fontSize(fontSizes.sm)
          .fontColor(this.themePrimary)
          .onClick((): void => { void this.handleToggle(key); })
        Text('删除')
          .fontSize(fontSizes.sm)
          .fontColor(this.themeError)
          .onClick((): void => { this.handleDelete(key); })
      }
      .width('100%')
      .margin({ top: spacing.sm })
    }
    .width('100%')
    .padding(spacing.md)
    .backgroundColor(this.themeSurface)
    .borderRadius(borderRadius.lg)
    .margin({ bottom: spacing.md })
  }

  @Builder
  CreateModal() {
    Stack() {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('rgba(0,0,0,0.5)')
        .onClick((): void => { this.showCreateModal = false; })
      Column({ space: spacing.md }) {
        Text('新建 API 令牌')
          .fontSize(fontSizes.lg).fontWeight(FontWeight.Bold).fontColor(this.themeText)
          .width('100%').textAlign(TextAlign.Center)
        TextInput({ placeholder: '例如：NAS 同步', text: this.newName })
          .placeholderColor(this.themeTextSec)
          .fontColor(this.themeText)
          .height(48)
          .padding({ left: spacing.md, right: spacing.md })
          .border({ width: 1, color: this.themeBorder })
          .borderRadius(borderRadius.md)
          .width('100%')
          .onChange((v: string): void => { this.newName = v; })
        TextInput({ placeholder: '有效天数（0 表示永不过期）', text: this.expiresInDays })
          .placeholderColor(this.themeTextSec)
          .fontColor(this.themeText)
          .type(InputType.Number)
          .height(48)
          .padding({ left: spacing.md, right: spacing.md })
          .border({ width: 1, color: this.themeBorder })
          .borderRadius(borderRadius.md)
          .width('100%')
          .onChange((v: string): void => { this.expiresInDays = v; })
        Row({ space: spacing.sm }) {
          Button('取消')
            .backgroundColor(this.themeBorder)
            .fontColor(this.themeText)
            .layoutWeight(1)
            .onClick((): void => { this.showCreateModal = false; })
          Button(this.creating ? '创建中...' : '创建')
            .backgroundColor(this.themePrimary)
            .fontColor(Color.White)
            .layoutWeight(1)
            .enabled(!this.creating && this.newName.trim().length > 0)
            .onClick((): void => { void this.handleCreate(); })
        }
        .width('100%')
      }
      .width('80%')
      .padding(spacing.lg)
      .backgroundColor(this.themeSurface)
      .borderRadius(borderRadius.lg)
    }
    .width('100%')
    .height('100%')
  }

  @Builder
  TokenModal() {
    Stack() {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('rgba(0,0,0,0.5)')
        .onClick((): void => { this.showTokenModal = false; })
      Column({ space: spacing.md }) {
        Text('令牌已创建')
          .fontSize(fontSizes.lg).fontWeight(FontWeight.Bold).fontColor(this.themeText)
          .width('100%').textAlign(TextAlign.Center)
        Text('请立即复制并保存，关闭后无法再次查看明文。')
          .fontSize(fontSizes.sm).fontColor('#f59e0b')
          .width('100%')
        Text(this.createdToken)
          .fontSize(fontSizes.sm)
          .fontColor(this.themeText)
          .backgroundColor(this.themeBg)
          .borderRadius(borderRadius.md)
          .padding(spacing.md)
          .width('100%')
          .copyOption(CopyOptions.InApp)
        Text('长按上方文本可复制')
          .fontSize(fontSizes.xs)
          .fontColor(this.themeTextSec)
          .width('100%')
        Row({ space: spacing.sm }) {
          Button('我已保存')
            .backgroundColor(this.themePrimary)
            .fontColor(Color.White)
            .layoutWeight(1)
            .onClick((): void => { this.showTokenModal = false; })
        }
        .width('100%')
      }
      .width('86%')
      .padding(spacing.lg)
      .backgroundColor(this.themeSurface)
      .borderRadius(borderRadius.lg)
    }
    .width('100%')
    .height('100%')
  }

  @Builder
  RenameModal() {
    Stack() {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('rgba(0,0,0,0.5)')
        .onClick((): void => { this.showRenameModal = false; })
      Column({ space: spacing.md }) {
        Text('重命名令牌')
          .fontSize(fontSizes.lg).fontWeight(FontWeight.Bold).fontColor(this.themeText)
          .width('100%').textAlign(TextAlign.Center)
        TextInput({ placeholder: '名称', text: this.renameName })
          .placeholderColor(this.themeTextSec)
          .fontColor(this.themeText)
          .height(48)
          .padding({ left: spacing.md, right: spacing.md })
          .border({ width: 1, color: this.themeBorder })
          .borderRadius(borderRadius.md)
          .width('100%')
          .onChange((v: string): void => { this.renameName = v; })
        Row({ space: spacing.sm }) {
          Button('取消')
            .backgroundColor(this.themeBorder)
            .fontColor(this.themeText)
            .layoutWeight(1)
            .onClick((): void => { this.showRenameModal = false; })
          Button('保存')
            .backgroundColor(this.themePrimary)
            .fontColor(Color.White)
            .layoutWeight(1)
            .enabled(this.renameName.trim().length > 0)
            .onClick((): void => { void this.handleRename(); })
        }
        .width('100%')
      }
      .width('80%')
      .padding(spacing.lg)
      .backgroundColor(this.themeSurface)
      .borderRadius(borderRadius.lg)
    }
    .width('100%')
    .height('100%')
  }

  build() {
    Stack() {
      Column() {
        Scroll() {
          Column({ space: spacing.md }) {
            Text('令牌可用于在 NAS、脚本或其他设备上访问书仓内容（账号信息除外）。令牌只在创建时显示一次，请妥善保存。')
              .fontSize(fontSizes.sm)
              .fontColor(this.themeTextSec)
              .lineHeight(20)
              .width('100%')

            if (this.loading) {
              LoadingProgress()
                .color(this.themePrimary)
                .width(40)
                .height(40)
                .margin({ top: 60 })
            } else if (this.keys.length === 0) {
              Text('暂无令牌，点击下方按钮创建')
                .fontSize(fontSizes.md)
                .fontColor(this.themeTextSec)
                .margin({ top: 60 })
                .width('100%')
                .textAlign(TextAlign.Center)
            } else {
              ForEach(this.keys, (key: ApiKey): void => {
                this.TokenCard(key)
              }, (key: ApiKey): string => key.id)
            }
          }
          .width('100%')
          .padding(spacing.lg)
          .padding({ bottom: 100 })
        }
        .width('100%')
        .layoutWeight(1)

        Button('新建令牌')
          .backgroundColor(this.themePrimary)
          .fontColor(Color.White)
          .width('calc(100% - 48vp)')
          .margin({ bottom: 24, left: 24, right: 24 })
          .onClick((): void => { this.showCreateModal = true; })
      }
      .width('100%')
      .height('100%')
      .backgroundColor(this.themeBg)

      if (this.showCreateModal) {
        this.CreateModal()
      }
      if (this.showTokenModal) {
        this.TokenModal()
      }
      if (this.showRenameModal) {
        this.RenameModal()
      }
    }
    .width('100%')
    .height('100%')
  }
}
