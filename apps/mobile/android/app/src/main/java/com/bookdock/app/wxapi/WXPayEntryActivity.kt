package com.bookdock.app.wxapi

import android.app.Activity
import android.os.Bundle
import com.theweflex.react.WeChatModule

/**
 * 微信支付结果回调 Activity。
 * 微信支付完成后会拉起这个 Activity,SDK 通过 WeChatModule.handleIntent 解析回调结果,
 * 然后通过 DeviceEventEmitter('WeChat_Resp') 通知 RN 层(见 services/payments.ts 中的 loadWeChatModule)。
 * 配置:AndroidManifest 里 <activity android:name=".wxapi.WXPayEntryActivity"/>
 */
class WXPayEntryActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    WeChatModule.handleIntent(intent)
    finish()
  }
}