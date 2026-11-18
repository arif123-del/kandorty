plugins {
    id("com.android.application")
}

android {
    namespace = "online.kandorty.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "online.kandorty.app.preview238"
        minSdk = 24
        targetSdk = 35
        versionCode = 21
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        versionName = "2.3.8"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")
}
