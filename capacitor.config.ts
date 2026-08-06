import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'dev.calendar.app',
  appName: 'Calendar',
  webDir: 'web/dist',
  android: {
    allowMixedContent: true
  }
}

export default config
