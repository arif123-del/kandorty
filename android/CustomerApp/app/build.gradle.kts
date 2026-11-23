plugins {
    id("com.android.application")
}
android {
    namespace = "online.kandorty.store"
    compileSdk = 35
    defaultConfig {
        // Confirm permanent ID before first Play Store release.
        applicationId = "online.kandorty.store"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
