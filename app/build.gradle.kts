plugins {
    id("com.android.application")
    id("com.google.gms.google-services") version "4.6.0" apply false
}

// Android FCM credentials MUST be registered for package online.kandorty.admin.
// Without app/google-services.json, this APK still runs as a native WebView,
// but cannot obtain a usable device token or receive server FCM notifications.
val hasAndroidFirebaseApp = file("google-services.json").exists()
if (hasAndroidFirebaseApp) apply(plugin = "com.google.gms.google-services")

android {
    namespace = "online.kandorty.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "online.kandorty.admin"
        minSdk = 24
        targetSdk = 35
        versionCode = 4
        versionName = "1.2.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("boolean", "NATIVE_FCM_CONFIGURED", if (hasAndroidFirebaseApp) "true" else "false")
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(platform("com.google.firebase:firebase-bom:35.2.0"))
    implementation("com.google.firebase:firebase-messaging")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")
}
