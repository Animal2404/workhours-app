import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.workhours.app',
  appName: '工时记',
  webDir: 'dist',
  android: {
    // 允许 WebView 使用本地存储（工时数据保存在设备上，不上传任何服务器）
    allowMixedContent: false,
    /*
      WebView 自己的底色。用「全透明」是有意的：
      透明之后露出的是原生窗口背景 AppTheme.NoActionBar 的
      android:windowBackground（@color/app_background），
      而它是 values-night 感知的 —— 系统深色模式就是深色。

      如果这里写死 #ffffff（Capacitor 默认），深色模式用户在
      WebView 画出第一帧之前必然看到一下白底，也就是那道白闪。
      也不再写死深色：那样浅色模式用户会反过来看到黑闪。
    */
    backgroundColor: '#00000000',
    /*
      安全区（刘海 / 底部手势条）适配。
      ------------------------------------------------------------
      必须显式设成 'auto'，否则 Android 15 上底部导航可能被系统手势条盖住。

      依据是读 node_modules 里实际安装的 Capacitor 源码，不是文档：
        · CapConfig.java:57        adjustMarginsForEdgeToEdge 默认 "disable"
        · CapacitorWebView.java:61 "disable" 时第一行直接 return，
                                   根本不注册 WindowInsets 监听
      而本工程 targetSdkVersion = 35，Android 15 对 targetSdk>=35 的应用
      强制 edge-to-edge。两者一叠加：WebView 铺满全屏，但
      env(safe-area-inset-*) 拿不到值（退化成 0）。
      底部导航正是靠 env(safe-area-inset-bottom) 定位的，于是会贴住手势条。

      'auto' 在 Android 15+ 且未自行 opt-out 时才补 margins，
      低版本与主动 opt-out 的机型行为不变。
    */
    adjustMarginsForEdgeToEdge: 'auto',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
