import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.workhours.app',
  appName: '工时记',
  webDir: 'dist',
  android: {
    // 允许 WebView 使用本地存储（工时数据保存在设备上，不上传任何服务器）
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
