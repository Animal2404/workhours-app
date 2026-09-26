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
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
