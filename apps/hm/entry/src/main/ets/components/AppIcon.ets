// [API 23+] components/AppIcon.ets — 应用内统一图标出口
// 设计目标:
//  1. 上层只用语义名字(AppIconKind),不直接写 $r('sys.symbol.xxx') 字符串;
//  2. 资源名不存在的 sys.symbol 走 fallback 文本,不让 UI 渲染成空;
//  3. 后续要批量换风格(填充/线性/多色)只改这里。
//
// 已验证可用的 sys.symbol(API 22 真机实测存在):
//   house_fill / person_fill / play_fill / magnifyingglass
// 未验证或已知缺失:sparkles / refresh / gear / audio_waveform / qrcode / eye / eye_slash
//  → 缺失的统一用文本符号 fallback(不是 emoji,是 SF Symbol 风格的字形)。

// 图标语义枚举(对应 mobile Ionicons 的命名)
export enum AppIconKind {
  Search,        // magnifyingglass
  Library,       // 书仓(库)
  Person,        // 用户
  Globe,         // 外网
  Wifi,          // 内网
  Lock,          // 密码
  Eye,           // 显示密码
  EyeOff,        // 隐藏密码
  QrCode,        // 二维码
  ArrowUp,       // 回顶
  Home,          // 主页(推荐)
  Play,          // 播放
  Book,          // 书籍占位(应用 Logo)
  ArrowBack,     // 返回(chevron_left)
  MoreVertical,  // 更多菜单 ⋮
  ChevronDown,   // 展开
  ChevronUp,     // 收起
  ChevronRight,  // 右箭头
  FolderOpen,    // 打开文件夹(folder_fill)
  Heart,         // 收藏(实心)
  HeartOutline,  // 未收藏(空心)
  Close,         // 关闭 ×
  Plus,          // 加号
  Headset,       // 耳机(听书)
  DocText,       // 文档(笔记)
  Refresh,       // 刷新(sys.symbol 无 refresh,用循环箭头字符)
  Settings,      // 设置(sys.symbol.gearshape)
  Diamond        // 钻石(VIP,sys.symbol.diamond)
}

@Component
export struct AppIcon {
  @Prop kind: AppIconKind = AppIconKind.Book;
  @Prop iconSize: number = 20;
  @Prop iconColor: string = '#1F2937';

  build() {
    // ArkTS $r() 必须传字符串字面量,不能传变量 — 所以这里 if/else 直写
    if (this.kind === AppIconKind.Search) {
      SymbolGlyph($r('sys.symbol.magnifyingglass'))
        .fontSize(this.iconSize)
        .fontColor([this.iconColor])
    } else if (this.kind === AppIconKind.Person) {
      SymbolGlyph($r('sys.symbol.person_fill'))
        .fontSize(this.iconSize)
        .fontColor([this.iconColor])
    } else if (this.kind === AppIconKind.Home) {
      SymbolGlyph($r('sys.symbol.house_fill'))
        .fontSize(this.iconSize)
        .fontColor([this.iconColor])
    } else if (this.kind === AppIconKind.Play) {
      SymbolGlyph($r('sys.symbol.play_fill'))
        .fontSize(this.iconSize)
        .fontColor([this.iconColor])
    } else if (this.kind === AppIconKind.Library) {
      // 书仓(书堆符号,不用 emoji)
      Text('▤').fontSize(this.iconSize).fontColor(this.iconColor)
    } else if (this.kind === AppIconKind.Globe) {
      // 外网(地球用圆圈加十字)
      Text('⊕').fontSize(this.iconSize).fontColor(this.iconColor)
    } else if (this.kind === AppIconKind.Wifi) {
      // 内网(WiFi 用弧线)
      Text('⌒').fontSize(this.iconSize).fontColor(this.iconColor)
    } else if (this.kind === AppIconKind.Lock) {
      // 锁(锁孔符号)
      Text('⚿').fontSize(this.iconSize).fontColor(this.iconColor)
    } else if (this.kind === AppIconKind.Eye) {
      // 眼睛(睁眼)
      Text('◉').fontSize(this.iconSize).fontColor(this.iconColor)
    } else if (this.kind === AppIconKind.EyeOff) {
      // 眼睛关闭(空心圆)
      Text('◌').fontSize(this.iconSize).fontColor(this.iconColor)
    } else if (this.kind === AppIconKind.QrCode) {
      // 二维码(田字格)
      Text('▦').fontSize(this.iconSize).fontColor(this.iconColor)
    } else if (this.kind === AppIconKind.ArrowUp) {
      // 回顶(向上箭头)
      Text('↑').fontSize(this.iconSize).fontColor(this.iconColor)
    } else if (this.kind === AppIconKind.ArrowBack) {
      SymbolGlyph($r('sys.symbol.chevron_left'))
        .fontSize(this.iconSize)
        .fontColor([this.iconColor])
    } else if (this.kind === AppIconKind.MoreVertical) {
      // 竖排三点
      Text('⋮').fontSize(this.iconSize).fontColor(this.iconColor)
    } else if (this.kind === AppIconKind.ChevronDown) {
      SymbolGlyph($r('sys.symbol.chevron_down'))
        .fontSize(this.iconSize)
        .fontColor([this.iconColor])
    } else if (this.kind === AppIconKind.ChevronUp) {
      SymbolGlyph($r('sys.symbol.chevron_up'))
        .fontSize(this.iconSize)
        .fontColor([this.iconColor])
    } else if (this.kind === AppIconKind.ChevronRight) {
      SymbolGlyph($r('sys.symbol.chevron_right'))
        .fontSize(this.iconSize)
        .fontColor([this.iconColor])
    } else if (this.kind === AppIconKind.FolderOpen) {
      SymbolGlyph($r('sys.symbol.folder_fill'))
        .fontSize(this.iconSize)
        .fontColor([this.iconColor])
    } else if (this.kind === AppIconKind.Heart) {
      SymbolGlyph($r('sys.symbol.heart_fill'))
        .fontSize(this.iconSize)
        .fontColor([this.iconColor])
    } else if (this.kind === AppIconKind.HeartOutline) {
      SymbolGlyph($r('sys.symbol.heart'))
        .fontSize(this.iconSize)
        .fontColor([this.iconColor])
    } else if (this.kind === AppIconKind.Close) {
      SymbolGlyph($r('sys.symbol.xmark'))
        .fontSize(this.iconSize)
        .fontColor([this.iconColor])
    } else if (this.kind === AppIconKind.Plus) {
      SymbolGlyph($r('sys.symbol.plus'))
        .fontSize(this.iconSize)
        .fontColor([this.iconColor])
    } else if (this.kind === AppIconKind.Headset) {
      // 耳机(听书) — sys.symbol 无对应,用几何字符
      Text('♬').fontSize(this.iconSize).fontColor(this.iconColor)
    } else if (this.kind === AppIconKind.DocText) {
      SymbolGlyph($r('sys.symbol.doc_plaintext'))
        .fontSize(this.iconSize)
        .fontColor([this.iconColor])
    } else if (this.kind === AppIconKind.Refresh) {
      // 刷新(sys.symbol.refresh 未验证,用循环箭头字符,非 emoji)
      Text('↻').fontSize(this.iconSize).fontColor(this.iconColor)
    } else if (this.kind === AppIconKind.Settings) {
      // 设置 — sys.symbol.gearshape (SF Symbols 命名,实测存在)
      SymbolGlyph($r('sys.symbol.gearshape'))
        .fontSize(this.iconSize)
        .fontColor([this.iconColor])
    } else if (this.kind === AppIconKind.Diamond) {
      // 钻石/VIP — sys.symbol.diamond (SF Symbols 命名)
      SymbolGlyph($r('sys.symbol.diamond'))
        .fontSize(this.iconSize)
        .fontColor([this.iconColor])
    } else {
      // 默认 Book(书堆)
      Text('▤').fontSize(this.iconSize).fontColor(this.iconColor)
    }
  }
}
