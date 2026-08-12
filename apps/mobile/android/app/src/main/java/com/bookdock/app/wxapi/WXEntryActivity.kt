package com.bookdock.app.wxapi

import android.app.Activity
import android.os.Bundle
import com.theweflex.react.WeChatModule

/**
 * 微信入口 Activity,用于处理微信 App 拉回 BookDock 时的 intent(分享/登录回调等)。
 * react-native-wechat-lib 不自带这个 Activity,需要各 app 自行声明。
 * 配置:AndroidManifest 里 <activity android:name=".wxapi.WXEntryActivity"/>
 */
class WXEntryActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    WeChatModule.handleIntent(intent)
    finish()
  }
}