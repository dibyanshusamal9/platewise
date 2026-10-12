import type { CapacitorConfig } from '@capacitor/cli'

// The Android app is a native shell around the *deployed* Platewise site. Every web
// deploy therefore reaches installed phones without shipping a new APK.
// Set CAP_SERVER_URL in .env (or the environment) before `npm run mobile:sync`.
try {
  process.loadEnvFile?.('.env')
} catch {
  // No .env file. Fine in CI, where the variable comes from the environment.
}

// Default: the Vite dev server as seen from the Android emulator (10.0.2.2 = host machine).
const serverUrl = (process.env.CAP_SERVER_URL || 'http://10.0.2.2:3000').replace(/\/$/, '')
const isLocalHttp = serverUrl.startsWith('http://')

const config: CapacitorConfig = {
  appId: 'app.platewise.mobile',
  appName: 'Platewise',
  webDir: 'mobile/www',
  server: {
    url: serverUrl,
    // Plain HTTP is only allowed for local development builds.
    cleartext: isLocalHttp,
    // Shown when the site can't be reached at launch (no network, server down).
    errorPath: 'offline.html',
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: isLocalHttp,
  },
  plugins: {
    SystemBars: {
      // Edge-to-edge, with --safe-area-inset-* CSS variables the app uses for padding.
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: '#f6f5f1',
      showSpinner: false,
    },
  },
}

export default config
