plugins {
    id("com.android.application")
}

android {
    namespace = "online.kandorty.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "online.kandorty.app.test"
        minSdk = 24
        targetSdk = 35
        versionCode = 19
        versionName = "2.3.6"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
